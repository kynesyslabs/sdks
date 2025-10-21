import {
    BridgeOperation,
    BridgeOperationCompiled,
    SupportedChain,
    SupportedStablecoin,
    supportedChains,
    supportedNonEVMChains,
    supportedStablecoins,
    StableCoinContracts,
    usdcAbi,
    providerUrls,
    EVMTankData,
    abis,
} from "./nativeBridgeTypes"
import {
    ethers,
    keccak256,
    Signature,
    solidityPacked,
    TransactionReceipt,
} from "ethers"
import { DefaultChain, EVM } from "@/multichain/core"
import { Demos } from "@/websdk/demosclass"
import {
    EVMGasOptions,
    NativeBridgeOperation,
    RPCRequest,
    RPCResponse,
} from "@/types"
import { Connection, PublicKey } from "@solana/web3.js"
import { Hashing, hexToUint8Array, uint8ArrayToHex } from "@/encryption"
import {
    prepareXMPayload,
    prepareXMScript,
    _required as required,
    skeletons,
} from "@/websdk"
import {
    RPCResponseWithBridgeOperationCompiled,
    RPCResponseWithValidityData,
} from "@/types/communication/rpc"

export class NativeBridge {
    private demos: Demos
    private xm: EVM
    private MIN_BRIDGE_AMOUNT: number = 1 // $1 minimum
    private MAX_BRIDGE_AMOUNT: number = 10_000 // $10k maximum

    /**
     * Constructor for the NativeBridge class
     *
     * @param demos The demos instance for communicating with the demos network
     * @param xm The crosschain sdk instance (e.g. EVM) with the wallet and provider connected for communicating with the xm network
     */
    constructor(demos: Demos, xm: EVM) {
        this.demos = demos
        this.xm = xm as EVM
    }

    /**
     * Checks if the bridge operation properties are supported.
     *
     * @param operation The operation to validate
     */
    async validateOperation(operation: BridgeOperation): Promise<void> {
        const validations: Array<Function> = [
            this.validateChainSupport,
            this.validateAmount,
            this.validateAddressFormats,
            this.validateFromBalance,
        ]

        for (const validation of validations) {
            // INFO: Execute validation functions.
            // If something goes wrong, the function will throw an error.
            await validation.call(this, operation)
        }
    }

    /**
     * Validates that the bridging chain and currency are supported.
     *
     * @param operation The operation to validate
     * @throws Error if any chain is not supported
     */
    private validateChainSupport(operation: BridgeOperation): void {
        // TODO: Put this back in production
        // if (operation.from.chain === operation.to.chain) {
        //     throw new Error(
        //         `Invalid bridge operation: cannot bridge from ${operation.from.chain} to the same chain`,
        //     )
        // }

        if (!supportedStablecoins.includes(operation.token.name)) {
            throw new Error(`Unsupported token: ${operation.token.name}`)
        }

        const allSupportedChains = [
            ...supportedChains,
            ...supportedNonEVMChains,
        ]

        if (!allSupportedChains.includes(operation.from.chain as any)) {
            throw new Error(`Unsupported from chain: ${operation.from.chain}`)
        }

        if (!allSupportedChains.includes(operation.to.chain as any)) {
            throw new Error(`Unsupported to chain: ${operation.to.chain}`)
        }
    }

    /**
     * Validates that the amount is a valid positive number
     * and that it is within the acceptable limits
     *
     * @param operation The operation to validate
     * @throws Error if amount is invalid
     */
    private validateAmount(operation: BridgeOperation): void {
        const amount = parseFloat(operation.token.amount)

        if (isNaN(amount)) {
            throw new Error(
                `Invalid amount: ${operation.token.amount} is not a valid number`,
            )
        }

        if (amount < this.MIN_BRIDGE_AMOUNT) {
            throw new Error(
                `Invalid amount: ${operation.token.amount} must be greater than ${this.MIN_BRIDGE_AMOUNT}`,
            )
        }

        if (amount > this.MAX_BRIDGE_AMOUNT) {
            throw new Error(
                `Invalid amount: ${operation.token.amount} must be less than ${this.MAX_BRIDGE_AMOUNT}`,
            )
        }
    }

    /**
     * Validates address formats for their respective chains
     *
     * @param operation The operation to validate
     * @throws Error if addresses are improperly formatted
     */
    private validateAddressFormats(operation: BridgeOperation): void {
        this.validateAddressFormat(operation.from.address, operation.from.chain)
        this.validateAddressFormat(operation.to.address, operation.to.chain)
    }

    /**
     * Validates a single address format based on chain type
     *
     * @param address The address to validate
     * @param chain The chain the address belongs to
     * @param addressType Description for error messages
     *
     * @throws Error if address format is invalid
     */
    private validateAddressFormat(
        address: string,
        chain: SupportedChain,
    ): void {
        if (chain.startsWith("evm")) {
            // EVM address validation (0x followed by 40 hex characters)
            const evmAddressRegex = /^0x[a-fA-F0-9]{40}$/
            if (!evmAddressRegex.test(address)) {
                throw new Error(
                    `Invalid address format for ${chain}: ${address}`,
                )
            }
        } else if (chain.startsWith("solana")) {
            // Solana address validation (Base58, typically 32-44 characters)
            const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
            if (!solanaAddressRegex.test(address)) {
                throw new Error(
                    `Invalid address format for ${chain}: ${address}`,
                )
            }
        }
    }

    /**
     * Validates that the from address has enough balance to bridge the amount
     *
     * @param operation The operation to validate
     * @throws Error if the from address does not have enough balance
     */
    private async validateFromBalance(
        operation: BridgeOperation,
    ): Promise<void> {
        const requiredAmount = parseFloat(operation.token.amount)
        const fromChain = operation.from.chain
        const fromAddress = operation.from.address
        const token = operation.token.name

        let accountBalance = 0

        if (supportedChains.includes(fromChain as SupportedChain)) {
            // Handle EVM chains
            accountBalance = await this.getEVMTokenBalance(operation)
        } else if (fromChain.startsWith("solana")) {
            // Handle Solana
            accountBalance = await this.getSolanaTokenBalance(operation)
        } else {
            throw new Error(
                `Unsupported chain for balance validation: ${fromChain}`,
            )
        }

        if (accountBalance < requiredAmount) {
            throw new Error(
                `Insufficient ${token} balance on ${fromChain}: has ${accountBalance}, needs ${requiredAmount}`,
            )
        }
    }

    /**
     * Gets token balance for EVM chains
     *
     * @param chain The EVM chain
     * @param contractAddress The token contract address
     * @param walletAddress The wallet address
     * @returns The token balance
     */
    public async getEVMTokenBalance(
        operation: BridgeOperation,
    ): Promise<number> {
        const chain = operation.from.chain
        // const subchain = operation.from.subchain
        const contractAddress = StableCoinContracts[operation.token.name][chain]
        const walletAddress = operation.from.address

        try {
            const provider = new ethers.JsonRpcProvider(providerUrls[chain])
            const contract = new ethers.Contract(
                contractAddress,
                usdcAbi,
                provider,
            )
            const balance = await contract.balanceOf(walletAddress)
            const decimals = await contract.decimals()

            return parseFloat(ethers.formatUnits(balance, decimals))
        } catch (error) {
            throw new Error(`Failed to get EVM token balance: ${error}`)
        }
    }

    /**
     * Gets token balance for Solana
     *
     * @param walletAddress The wallet address
     * @param token The token type
     * @returns The token balance
     */
    private async getSolanaTokenBalance(
        operation: BridgeOperation,
    ): Promise<number> {
        const chain = operation.from.chain
        // const subchain = operation.from.subchain
        const walletAddress = operation.from.address

        try {
            const connection = new Connection(providerUrls[chain])
            const walletPublicKey = new PublicKey(walletAddress)
            // const usdcMint = new PublicKey(usdcContracts.solana) // USDC mint address

            // Get associated token account
            // const associatedTokenAccount = await Token.getAssociatedTokenAddress(
            //     usdcMint,
            //     usdcMint,
            //     walletPublicKey
            // )

            // Get token account balance
            // const balance = await connection.getTokenAccountBalance(associatedTokenAccount)
            // return parseFloat(balance.value.uiAmountString || '0')
            return 0
        } catch (error) {
            throw new Error(`Failed to get Solana token balance: ${error}`)
        }
    }

    /**
     * Generates a unique bridge ID for the native bridge operation
     *
     * @param operation Native bridge operation
     * @param depositTxHash Deposit to tank transaction hash
     *
     * @returns bridge ID string
     */
    generateBridgeId(
        operation: NativeBridgeOperation,
        depositTxHash: string,
    ): string {
        // Create deterministic but unique bridge ID using operation data + timestamp + random bytes
        const operationData = `${operation.from.chain}->${operation.to.chain}:${operation.token.amount}:${operation.address}:${operation.to.address}`

        // const timestamp = Date.now().toString()
        // const randomSuffix = randomBytes(8).toString("hex")

        // Hash to create clean, fixed-length bridge ID
        const bridgeData = `${operationData}:${depositTxHash}`
        return `bridge_${Hashing.sha256(bridgeData)}`
    }

    /**
     * Locally validates the bridge operation parameters, then sends it to the RPC to be validated
     *
     * @param operation The operation to validate
     * @returns The compiled operation
     */
    async validate(
        operation: BridgeOperation,
    ): Promise<RPCResponseWithBridgeOperationCompiled> {
        required(this.demos, "Demos instance not connected")
        required(
            this.demos.walletConnected,
            "Wallet not connected to the Demos object",
        )

        if (!operation.token.address) {
            operation.token.address =
                StableCoinContracts[operation.token.name][operation.from.chain]
        }

        await this.validateOperation(operation)

        // INFO: Create the operation signature
        const hash = Hashing.sha256(JSON.stringify(operation))
        const signature = await this.demos.crypto.sign(
            this.demos.algorithm,
            new TextEncoder().encode(hash),
        )
        const signatureHex = uint8ArrayToHex(signature.signature)

        // INFO: Signature will be verified by the RPC before processing the operation
        const req: RPCRequest = {
            method: "nativeBridge",
            params: [
                operation,
                {
                    type: this.demos.algorithm,
                    data: signatureHex,
                },
            ],
        }

        return await this.demos.rpcCall<RPCResponseWithBridgeOperationCompiled>(
            req,
            true,
        )
    }

    /**
     * Prepares the bridge operation execution by converting it to a transaction
     * and sending it back to the RPC for validation.
     *
     * @param compiled The compiled operation
     * @param txHash The txhash for depositing the bridge amount to the tank
     * @returns RPC response with transaction validity data
     */
    async confirm(
        compiled: RPCResponseWithBridgeOperationCompiled,
        txHash: string,
    ): Promise<RPCResponseWithValidityData> {
        required(this.demos, "Demos instance not connected")
        required(
            this.demos.walletConnected,
            "Wallet not connected to the Demos object",
        )
        required(
            txHash,
            "The crosschain deposit to tank transaction hash is missing",
        )

        const depositTx = await this.xm.provider.getTransactionReceipt(txHash)
        if (!depositTx) {
            throw new Error("Transaction receipt not found")
        }

        this.verifyDepositTx(depositTx, compiled)

        // INFO: Verify the RPC signature
        const operation = compiled.response

        const hash = Hashing.sha256(JSON.stringify(operation.content))

        const verified = await this.demos.crypto.verify({
            algorithm: operation.signature.type,
            signature: hexToUint8Array(operation.signature.data),
            message: new TextEncoder().encode(hash),
            publicKey: hexToUint8Array(operation.rpcPublicKey),
        })

        if (!verified) {
            throw new Error(
                "Failed to verify the operation signature using the RPC public key",
            )
        }

        const bridgeId = this.generateBridgeId(
            operation.content.operation,
            txHash,
        )

        // INFO: Convert the operation to a bridge tx
        const tx = structuredClone(skeletons.transaction)
        tx.content = {
            ...tx.content,
            to: await this.demos.getEd25519Address(),
            type: "nativeBridge",
            data: ["nativeBridge", { operation, txHash, bridgeId }],
        }

        // INFO: Sign and confirm the tx
        const signed = await this.demos.sign(tx)
        return await this.demos.confirm(signed)
    }

    /**
     * Decodes event data using ABI decoder
     *
     * @param data The event data hex string
     * @param types Array of ABI types for decoding
     * @returns Decoded data array
     */
    private decodeEventData(data: string, types: string[]): any[] {
        if (!data || data === "0x") {
            throw new Error("Event data is empty")
        }

        try {
            return ethers.AbiCoder.defaultAbiCoder().decode(types, data)
        } catch (error) {
            throw new Error(`Failed to decode event data: ${error}`)
        }
    }

    /**
     * Verifies the deposit transaction
     *
     * @param tx The transaction receipt
     * @param compiled The compiled operation
     */
    verifyDepositTx(
        tx: TransactionReceipt,
        compiled: RPCResponseWithBridgeOperationCompiled,
    ) {
        required(
            tx,
            "The transaction receipt for depositing the bridge amount to the tank is required",
        )
        required(compiled, "The compiled operation is required")

        if (tx.status !== 1) {
            throw new Error(
                "Invalid deposit tx: transaction status: " + tx.status,
            )
        }

        if (!tx.logs || tx.logs.length === 0) {
            throw new Error("Invalid deposit tx: no logs found")
        }

        const operation = compiled.response.content
        const userAddress = operation.operation.from.address
        const tankData = operation.tankData as EVMTankData
        const tokenAddress = operation.operation.token.address
        const tankAddress = tankData.tankAddress

        const normalizedAddress = (addr: string): string => addr.toLowerCase()
        const topicAddress = (addr: string): string =>
            "0x" + addr.replace(/^0x/i, "").toLowerCase().padStart(64, "0")

        // 1. Verify Transfer log (ERC20 transfer from user to tank)
        const transferTopic =
            "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
        const expectedFromTopic = topicAddress(userAddress)
        const expectedToTopic = topicAddress(tankAddress)

        const transferLog = tx.logs.find(log => {
            return (
                normalizedAddress(log.address) ===
                    normalizedAddress(tokenAddress) &&
                Array.isArray(log.topics) &&
                log.topics.length === 3 &&
                log.topics[0].toLowerCase() === transferTopic &&
                log.topics[1].toLowerCase() === expectedFromTopic &&
                log.topics[2].toLowerCase() === expectedToTopic
            )
        })

        if (!transferLog) {
            throw new Error(
                "Invalid deposit tx: Transfer event from user to tank not found",
            )
        }

        const transferAmount = BigInt(transferLog.data)
        const expectedDepositAmount = BigInt(tankData.amountToDeposit)

        if (transferAmount !== expectedDepositAmount) {
            throw new Error(
                "Invalid deposit tx: transfer amount mismatch. Expected: " +
                    expectedDepositAmount.toString() +
                    ", Got: " +
                    transferAmount.toString(),
            )
        }

        // 2. Verify TokenDeposited log
        const tokenDepositedTopic =
            "0xf1444b5cad7ce70cb018d1b8edc8618fe303f3c7f034d8d572a6e27facbf2bef"
        const expectedTokenTopic = topicAddress(tokenAddress)
        const expectedUserTopic = topicAddress(userAddress)

        const tokenDepositedLog = tx.logs.find(log => {
            return (
                normalizedAddress(log.address) ===
                    normalizedAddress(tankAddress) &&
                Array.isArray(log.topics) &&
                log.topics.length === 3 &&
                log.topics[0].toLowerCase() === tokenDepositedTopic &&
                log.topics[1].toLowerCase() === expectedTokenTopic &&
                log.topics[2].toLowerCase() === expectedUserTopic
            )
        })

        if (!tokenDepositedLog) {
            throw new Error(
                "Invalid deposit tx: TokenDeposited event not found",
            )
        }

        const [depositedAmount] = this.decodeEventData(tokenDepositedLog.data, [
            "uint256",
        ])
        if (BigInt(depositedAmount) !== expectedDepositAmount) {
            throw new Error(
                "Invalid deposit tx: TokenDeposited amount mismatch. Expected: " +
                    expectedDepositAmount.toString() +
                    ", Got: " +
                    depositedAmount.toString(),
            )
        }

        // 3. Verify DepositAndBridgeExecuted log
        const depositAndBridgeTopic =
            "0x73db2af167b5ea544c7998b0761f723f3fec150d84f2f8bc3f7dd250e31bf83e"
        const expectedTokenTopicForBridge = topicAddress(tokenAddress)

        const depositAndBridgeLog = tx.logs.find(log => {
            return (
                normalizedAddress(log.address) ===
                    normalizedAddress(tankAddress) &&
                Array.isArray(log.topics) &&
                log.topics.length === 4 &&
                log.topics[0].toLowerCase() === depositAndBridgeTopic &&
                log.topics[1].toLowerCase() === expectedUserTopic &&
                log.topics[2].toLowerCase() === expectedTokenTopicForBridge &&
                log.topics[3].toLowerCase() === expectedUserTopic
            )
        })

        if (!depositAndBridgeLog) {
            throw new Error(
                "Invalid deposit tx: DepositAndBridgeExecuted event not found",
            )
        }

        // Parse the data field for DepositAndBridgeExecuted event
        const [
            logDepositAmount,
            logBridgeAmount,
            logDestChain,
            logRecipient,
            logNonce,
        ] = this.decodeEventData(depositAndBridgeLog.data, [
            "uint256",
            "uint256",
            "bytes",
            "address",
            "uint256",
        ])

        // Verify deposit amount matches
        if (BigInt(logDepositAmount) !== expectedDepositAmount) {
            throw new Error(
                "Invalid deposit tx: DepositAndBridgeExecuted depositAmount mismatch. Expected: " +
                    expectedDepositAmount.toString() +
                    ", Got: " +
                    logDepositAmount.toString(),
            )
        }

        // Verify bridge amount matches deposit amount (should be same for this transaction)
        if (BigInt(logBridgeAmount) !== expectedDepositAmount) {
            throw new Error(
                "Invalid deposit tx: DepositAndBridgeExecuted bridgeAmount mismatch. Expected: " +
                    expectedDepositAmount.toString() +
                    ", Got: " +
                    logBridgeAmount.toString(),
            )
        }

        // Verify destination chain
        const destChainString = ethers.toUtf8String(logDestChain)
        if (destChainString !== operation.operation.to.chain) {
            throw new Error(
                "Invalid deposit tx: DepositAndBridgeExecuted destination chain mismatch. Expected: " +
                    operation.operation.to.chain +
                    ", Got: " +
                    destChainString,
            )
        }

        // Verify recipient address
        if (
            normalizedAddress(logRecipient) !==
            normalizedAddress(operation.operation.to.address)
        ) {
            throw new Error(
                "Invalid deposit tx: DepositAndBridgeExecuted recipient mismatch. Expected: " +
                    operation.operation.to.address +
                    ", Got: " +
                    logRecipient,
            )
        }

        const data = {
            valid: true,
            bridgeId: "",
            depositAmount: BigInt(logDepositAmount.toString()),
            bridgeAmount: BigInt(logBridgeAmount.toString()),
            from: userAddress,
            to: {
                chain: destChainString,
                address: logRecipient,
            },
            nonce: BigInt(logNonce.toString()),
        }

        console.log("Deposit transaction verification successful:", data)
        return data
    }

    /**
     * Broadcasts the bridge transaction to the network (same as calling demos.broadcast)
     *
     * @param validityData The validity data of the bridge transaction
     */
    async broadcast(
        validityData: RPCResponseWithValidityData,
    ): Promise<RPCResponse> {
        return await this.demos.broadcast(validityData)
    }

    /**
     * Creates the allowance transaction for the bridge transaction
     *
     *
     *
     * @param demos The demos instance
     * @param evm The EVM instance
     * @param payload The payload of the bridge transaction
     * @param gasOptions The gas options for the allowance transaction
     */
    async authorizeAllowance(
        payload: RPCResponseWithBridgeOperationCompiled,
        gasOptions?: EVMGasOptions,
    ): Promise<RPCResponseWithValidityData> {
        required(this.demos, "Demos instance not connected")
        required(this.demos.walletConnected, "Demos wallet not connected")
        required(this.xm.wallet, "EVM wallet not connected")

        const operation = payload.response.content

        if (this.xm.getAddress() !== operation.operation.from.address) {
            throw new Error(
                "EVM wallet address address mismatch. Expected: " +
                    operation.operation.from.address +
                    ", Got: " +
                    this.xm.getAddress(),
            )
        }

        // Create the tx to authorize bridge amount allowance
        const tankData = operation.tankData as EVMTankData
        const token = operation.operation.token

        const contract = await this.xm.getContractInstance(
            token.address,
            abis[token.name],
        )

        // check if the user has enough balance to approve the allowance
        const balance = await this.xm.readFromContract(contract, "balanceOf", [
            this.xm.getAddress(),
        ])
        console.log("balance", balance)
        console.log("tankData.amountExpected", tankData.amountToDeposit)
        if (balance < tankData.amountToDeposit) {
            throw new Error("Insufficient balance to approve allowance")
        }

        const allowanceTx = await this.xm.writeToContract(
            contract,
            "approve",
            [tankData.tankAddress, tankData.amountToDeposit],
            gasOptions,
        )
        const [_, chain, subchain] = operation.operation.from.chain.split(".")

        const xmscript = prepareXMScript({
            chain: chain,
            signedPayloads: [allowanceTx],
            subchain: subchain,
            type: "contract_write",
            is_evm: true,
        })

        const signedDemosTx = await prepareXMPayload(xmscript, this.demos)
        return await this.demos.confirm(signedDemosTx)
    }

    /**
     * Verifies the allowance transaction
     *
     * @param allowanceTx The allowance transaction receipt
     * @param options The options for the verification
     * @param options.approvedAmount The approved amount
     * @param options.spender The spender address
     * @param options.approvedBy The address that approved the allowance
     * @param options.erc20ContractAddress The ERC20 contract address
     *
     * @throws Error if the allowance transaction does not match given params
     */
    verifyAllowanceTx(
        allowanceTx: TransactionReceipt,
        checks: {
            approvedBy: string
            approvedAmount: bigint
            spender: string
            erc20ContractAddress: string
        },
    ): void {
        if (allowanceTx.status !== 1) {
            throw new Error(
                "Invalid allowance tx: transaction status: " +
                    allowanceTx.status,
            )
        }

        if (!allowanceTx.logs || allowanceTx.logs.length === 0) {
            throw new Error("Invalid allowance tx: no logs found")
        }
        const normalizedAddress = (addr: string): string => addr.toLowerCase()
        const topicAddress = (addr: string): string =>
            "0x" + addr.replace(/^0x/i, "").toLowerCase().padStart(64, "0")

        // INFO: Verify the ERC20 contract address
        if (
            normalizedAddress(allowanceTx.logs[0].address) !==
            normalizedAddress(checks.erc20ContractAddress)
        ) {
            throw new Error(
                "Invalid allowance tx: ERC20 contract address mismatch. Expected: " +
                    checks.erc20ContractAddress +
                    ", Got: " +
                    allowanceTx.logs[0].address,
            )
        }

        const approvalTopic =
            "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"

        const expectedOwnerTopic = topicAddress(checks.approvedBy)
        const expectedSpenderTopic = topicAddress(checks.spender)

        const approvalLog = allowanceTx.logs.find(log => {
            return (
                Array.isArray(log.topics) &&
                log.topics.length === 3 &&
                log.topics[0].toLowerCase() === approvalTopic &&
                log.topics[1].toLowerCase() === expectedOwnerTopic &&
                log.topics[2].toLowerCase() === expectedSpenderTopic
            )
        })

        if (!approvalLog) {
            throw new Error(
                "Invalid allowance tx: Approval event with expected owner and spender not found",
            )
        }

        const approvedAmountFromLog = BigInt(approvalLog.data)
        const expectedAmount = BigInt(checks.approvedAmount)

        if (approvedAmountFromLog !== expectedAmount) {
            throw new Error(
                "Invalid allowance tx: approved amount mismatch. Expected: " +
                    expectedAmount.toString() +
                    ", Got: " +
                    approvedAmountFromLog.toString(),
            )
        }

        if (
            allowanceTx.from &&
            normalizedAddress(allowanceTx.from) !==
                normalizedAddress(checks.approvedBy)
        ) {
            throw new Error(
                "Invalid allowance tx: sender does not match approvedBy. Expected: " +
                    checks.approvedBy +
                    ", Got: " +
                    allowanceTx.from,
            )
        }
    }

    /**
     * Creates the permit signature for the bridge transaction
     *
     * @param payload The payload of the bridge transaction
     * @returns The permit signature
     */
    async createPermit(payload: RPCResponseWithBridgeOperationCompiled) {
        const compiled = payload.response.content
        const token = compiled.operation.token
        const tankData = compiled.tankData as EVMTankData
        // Get permit signature components
        const permitDeadline = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now

        const contract = await this.xm.getContractInstance(
            token.address,
            abis[token.name],
        )

        const version = await this.xm.readFromContract(contract, "version", [])
        const name = await this.xm.readFromContract(contract, "name", [])

        // Create permit signature (EIP-2612)
        const domain = {
            name: name,
            version: version,
            chainId: this.xm.chainId,
            verifyingContract: token.address,
        }

        const types = {
            Permit: [
                { name: "owner", type: "address" },
                { name: "spender", type: "address" },
                { name: "value", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" },
            ],
        }

        // Get the actual nonce from the token contract

        // get address nonce
        // const nonce = await this.xm.provider.getTransactionCount(compiled.operation.from.address)
        const nonce = await this.xm.readFromContract(contract, "nonces", [
            compiled.operation.from.address,
        ])

        const values = {
            owner: compiled.operation.from.address,
            spender: tankData.tankAddress,
            value: tankData.amountToDeposit,
            nonce: nonce, // ✅ Use actual nonce from contract
            deadline: permitDeadline,
        }

        console.log("Permit values with actual nonce:", values)

        const permitSig = await this.xm.wallet.signTypedData(
            domain,
            types,
            values,
        )
        const signature = Signature.from(permitSig)

        return {
            permitDeadline,
            v: signature.v,
            r: signature.r,
            s: signature.s,
        }
    }

    async signDepositMessage(
        payload: RPCResponseWithBridgeOperationCompiled,
    ): Promise<{
        signature: string
        permit: {
            permitDeadline: number
            v: number
            r: string
            s: string
        }
    }> {
        const permit = await this.createPermit(payload)
        const messageHash = ethers.solidityPackedKeccak256(
            [
                "string",
                "address",
                // "string",
                "address",
                "uint256",
                "string",
                "string",
                "address",
                "uint256",
                "uint256",
                // "uint256",
                "address",
            ],
            [
                "LIQUIDITY_TANK_PERMIT_DEPOSIT_BRIDGE",
                payload.response.content.operation.from.address,
                // payload.response.content.bridgeId,
                payload.response.content.operation.token.address,
                payload.response.content.tankData.amountToDeposit,
                this.xm.chainId.toString(),
                payload.response.content.operation.to.chain,
                payload.response.content.operation.to.address,
                payload.response.content.tankData.feeBps,
                permit.permitDeadline,
                // evm.chainId,
                payload.response.content.tankData.tankAddress,
            ],
        )

        return {
            signature: await this.xm.wallet.signMessage(
                ethers.getBytes(messageHash),
            ),
            permit,
        }
    }

    async createDepositTx(
        payload: RPCResponseWithBridgeOperationCompiled,
        gasOptions?: EVMGasOptions,
    ): Promise<any> {
        required(this.demos, "Demos instance not connected")
        required(this.demos.walletConnected, "Demos wallet not connected")
        required(this.xm.wallet, "EVM wallet not connected")

        const operation = payload.response.content
        const tankData = operation.tankData as EVMTankData
        const token = operation.operation.token

        const contract = await this.xm.getContractInstance(
            tankData.tankAddress,
            tankData.abi,
        )

        const message = await this.signDepositMessage(payload)

        // Create the tx to deposit the bridge amount via the tank contract
        const tx = await this.xm.writeToContract(
            contract,
            "depositAndBridgeWithPermit",
            [
                // operation.bridgeId,
                operation.operation.from.address,
                message.signature,
                // nonce,
                token.address,
                tankData.amountToDeposit,
                operation.operation.to.chain,
                operation.operation.to.address,
                tankData.feeBps,
                message.permit.permitDeadline,
                message.permit.v,
                message.permit.r,
                message.permit.s,
            ],
            gasOptions,
        )
        const [_, chain, subchain] = operation.operation.from.chain.split(".")

        const xmscript = prepareXMScript({
            chain: chain,
            signedPayloads: [tx],
            subchain: subchain,
            type: "contract_write",
            is_evm: true,
        })

        const signedDemosTx = await prepareXMPayload(xmscript, this.demos)
        return await this.demos.confirm(signedDemosTx)
    }
}
