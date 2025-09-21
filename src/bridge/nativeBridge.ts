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
import { EVM } from "@/multichain/core"
import { Demos } from "@/websdk/demosclass"
import { RPCRequest, RPCResponse } from "@/types"
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
    private MIN_BRIDGE_AMOUNT: number = 1 // $1 minimum
    private MAX_BRIDGE_AMOUNT: number = 10_000 // $10k maximum

    constructor(demos: Demos) {
        this.demos = demos
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
        if (operation.from.chain === operation.to.chain) {
            throw new Error(
                `Invalid bridge operation: cannot bridge from ${operation.from.chain} to the same chain`,
            )
        }

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
        return
        // @ts-ignore
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
    private async getEVMTokenBalance(
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

        // INFO: Convert the operation to a bridge tx
        const tx = structuredClone(skeletons.transaction)
        tx.content = {
            ...tx.content,
            to: await this.demos.getEd25519Address(),
            type: "nativeBridge",
            data: ["nativeBridge", { operation, txHash }],
        }

        // INFO: Sign and confirm the tx
        const signed = await this.demos.sign(tx)
        return await this.demos.confirm(signed)
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

    async authorizeAllowance(
        demos: Demos,
        evm: EVM,
        payload: RPCResponseWithBridgeOperationCompiled,
    ): Promise<RPCResponseWithValidityData> {
        required(demos, "Demos instance not connected")
        required(demos.walletConnected, "Demos wallet not connected")
        required(evm.wallet, "EVM wallet not connected")

        const operation = payload.response.content

        if (evm.getAddress() !== operation.operation.from.address) {
            throw new Error(
                "EVM wallet address address mismatch. Expected: " +
                    operation.operation.from.address +
                    ", Got: " +
                    evm.getAddress(),
            )
        }

        // Create the tx to authorize bridge amount allowance
        const tankData = operation.tankData as EVMTankData
        const token = operation.operation.token

        const contract = await evm.getContractInstance(
            token.address,
            abis[token.name],
        )

        // check if the user has enough balance to approve the allowance
        const balance = await evm.readFromContract(contract, "balanceOf", [
            evm.getAddress(),
        ])
        console.log("balance", balance)
        console.log("tankData.amountExpected", tankData.amountToDeposit)
        if (balance < tankData.amountToDeposit) {
            throw new Error("Insufficient balance to approve allowance")
        }

        const allowanceTx = await evm.writeToContract(
            contract,
            "approve",
            [tankData.tankAddress, tankData.amountToDeposit],
            {
                gasLimit: 60000,
                maxFeePerGas: 1.8,
                maxPriorityFeePerGas: 1.8,
            },
        )
        const [_, chain, subchain] = operation.operation.from.chain.split(".")

        const xmscript = prepareXMScript({
            chain: chain,
            signedPayloads: [allowanceTx],
            subchain: subchain,
            type: "contract_write",
            is_evm: true,
        })

        const signedDemosTx = await prepareXMPayload(xmscript, demos)
        return await demos.confirm(signedDemosTx)
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

    async createPermit(
        evm: EVM,
        payload: RPCResponseWithBridgeOperationCompiled,
    ) {
        const compiled = payload.response.content
        const token = compiled.operation.token
        const tankData = compiled.tankData as EVMTankData
        // Get permit signature components
        const permitDeadline = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now

        // Create permit signature (EIP-2612)
        const domain = {
            name: token.name,
            version: "1",
            chainId: evm.chainId,
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

        const values = {
            owner: compiled.operation.from.address,
            spender: tankData.tankAddress,
            value: tankData.amountToDeposit,
            nonce: permitDeadline,
            deadline: permitDeadline,
        }

        const permitSig = await evm.wallet.signTypedData(domain, types, values)
        const signature = Signature.from(permitSig)

        return {
            permitDeadline,
            v: signature.v,
            r: signature.r,
            s: signature.s,
        }
    }

    async signDepositMessage(
        evm: EVM,
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
        const permit = await this.createPermit(evm, payload)

        const messageHash = keccak256(
            solidityPacked(
                [
                    "string",
                    "address",
                    "uint256",
                    "address",
                    "uint256",
                    "string",
                    "string",
                    "address",
                    "uint256",
                    "uint256",
                    "uint256",
                    "address",
                ],
                [
                    "LIQUIDITY_TANK_PERMIT_DEPOSIT_BRIDGE",
                    payload.response.content.operation.from.address,
                    0n,
                    payload.response.content.operation.token.address,
                    BigInt(payload.response.content.tankData.amountToDeposit),
                    payload.response.content.operation.to.chain,
                    payload.response.content.operation.to.address,
                    payload.response.content.operation.to.address,
                    BigInt(payload.response.content.tankData.feeBps),
                    BigInt(permit.permitDeadline),
                    BigInt(evm.chainId),
                    payload.response.content.tankData.tankAddress,
                ],
            ),
        )

        return {
            signature: await evm.wallet.signMessage(messageHash),
            permit,
        }
    }

    async createDepositTx(
        demos: Demos,
        evm: EVM,
        payload: RPCResponseWithBridgeOperationCompiled,
        allowanceTxHash: string,
    ): Promise<any> {
        required(demos, "Demos instance not connected")
        required(demos.walletConnected, "Demos wallet not connected")
        required(evm.wallet, "EVM wallet not connected")
        required(allowanceTxHash, "Allowance tx hash not provided")

        // INFO: Verify allowance tx
        const allowanceTx = await evm.provider.getTransactionReceipt(
            allowanceTxHash,
        )
        console.log("allowanceTx", JSON.stringify(allowanceTx, null, 2))
        if (!allowanceTx) {
            throw new Error("Allowance tx not found")
        }

        const operation = payload.response.content
        const tankData = operation.tankData as EVMTankData
        const token = operation.operation.token

        this.verifyAllowanceTx(allowanceTx, {
            approvedBy: operation.operation.from.address,
            approvedAmount: tankData.amountToDeposit,
            spender: tankData.tankAddress,
            erc20ContractAddress: token.address,
        })

        const contract = await evm.getContractInstance(
            token.address,
            tankData.abi,
        )

        const message = await this.signDepositMessage(evm, payload)
        const nonce = 0

        // Create the tx to deposit the bridge amount via the tank contract
        const tx = await evm.writeToContract(
            contract,
            "depositAndBridgeWithPermit",
            [
                operation.bridgeId,
                operation.operation.from.address,
                message.signature,
                nonce,
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
        )
        const [_, chain, subchain] = operation.operation.from.chain.split(".")

        const xmscript = prepareXMScript({
            chain: chain,
            signedPayloads: [tx],
            subchain: subchain,
            type: "contract_write",
            is_evm: true,
        })

        const signedDemosTx = await prepareXMPayload(xmscript, demos)
        return await demos.confirm(signedDemosTx)
    }
}

// export const methods = {
//     /**
//      * Validates the chain
//      * @param chain
//      * @param chainType
//      * @param isOrigin (useful for error messages)
//      */
//     validateChain(
//         chain: string,
//         chainType: string,
//         isOrigin: boolean,
//     ) {
//         const chainTypeStr = isOrigin ? "origin" : "destination"
//         if (chainType === "EVM") {
//             if (!supportedEVMChains.includes(chain as SupportedEVMChain)) {
//                 throw new Error(
//                     `Invalid ${chainTypeStr} chain: ${chain} is not a supported EVM`,
//                 )
//             }
//         } else {
//             if (
//                 !supportedNonEVMChains.includes(
//                     chain as SupportedNonEVMChain,
//                 )
//             ) {
//                 throw new Error(
//                     `Invalid ${chainTypeStr} chain: ${chain} is not a supported chain`,
//                 )
//             }
//         }
//     },
//     /**
//      * Generates a new operation, ready to be sent to the node as a RPCRequest
//      * TODO Implement the params
//      * REVIEW Should we use the identity somehow or we keep using the private key?
//      */
//     generateOperation(
//         privateKey: string,
//         publicKey: string,
//         originChainType: SupportedChain,
//         originChain: SupportedEVMChain | SupportedNonEVMChain,
//         destinationChainType: SupportedChain,
//         destinationChain: SupportedEVMChain | SupportedNonEVMChain,
//         originAddress: string,
//         destinationAddress: string,
//         amount: string,
//         token: SupportedStablecoin,
//     ): RPCRequest {
//         // Ensuring the chains are valid: throw an error if not
//         this.validateChain(originChain, originChainType, true)
//         this.validateChain(destinationChain, destinationChainType, false)
//         // Defining the operation
//         const operation: BridgeOperation = {
//             demoAddress: publicKey,
//             originChainType: originChainType,
//             originChain: originChain,
//             destinationChainType: destinationChainType,
//             destinationChain: destinationChain,
//             originAddress: originAddress,
//             destinationAddress: destinationAddress,
//             amount: amount,
//             // @ts-ignore
//             token: token,
//             txHash: "",
//             status: "empty",
//         }
//         // REVIEW Sign the operation
//         let opHash = Hashing.sha256(JSON.stringify(operation))
//         let signature = Cryptography.sign(opHash, privateKey)
//         let hexSignature = new TextDecoder().decode(signature)
//         let nodeCallPayload: RPCRequest = {
//             method: "nativeBridge",
//             params: [operation, hexSignature],
//         }
//         return nodeCallPayload
//     },

//     /**
//      * Generates a bridge transaction ready for client confirmation and broadcasting.
//      *
//      * @param compiled - The compiled bridge operation from RPC
//      * @param demos - Demos instance for signing (provides wallet and nonce)
//      * @returns Signed transaction ready for demos.confirm() and demos.broadcast()
//      */
//     async generateOperationTx(compiled: BridgeOperationCompiled, demos: Demos): Promise<Transaction> {
//         // Extract addresses from the compiled operation
//         const operation = compiled.content.operation
//         const from = operation.originAddress      // Source chain address
//         const to = operation.originAddress        // Same as from (reflexive transaction)
//         const from_ed25519_address = operation.demoAddress  // Demos address that started operation

//         // Get proper nonce from demos instance
//         const nonce = await demos.getAddressNonce(from_ed25519_address)

//         // Prepare the transaction structure
//         const tx: Transaction = {
//             content: {
//                 type: "nativeBridge",
//                 data: ["nativeBridge", compiled],
//                 from: from,
//                 to: to,
//                 from_ed25519_address: from_ed25519_address,
//                 amount: 0,  // Always 0 for bridge operations
//                 gcr_edits: [],  // Will be generated by demos.sign()
//                 nonce: nonce + 1,
//                 timestamp: Date.now(),
//                 transaction_fee: {
//                     network_fee: 0,
//                     rpc_fee: 0,
//                     additional_fee: 0,
//                 },
//             },
//             signature: {
//                 type: "ed25519",
//                 data: "",
//             },
//             hash: "",
//             status: "empty",
//             blockNumber: 0,
//             ed25519_signature: ""
//         }

//         // Use demos.sign() which handles GCR generation, hashing, and signing
//         const signedTx = await demos.sign(tx)

//         // NOTE: Client must call demos.confirm(signedTx) then demos.broadcast(validationData)
//         // to complete the transaction flow, following the same pattern as pay() transactions
//         return signedTx
//     },
// }
