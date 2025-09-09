/**
 * Smart contract functionality for Demos SDK
 */

import { Demos } from './demosclass'
import { ContractFactory } from '../contracts/ContractFactory'
import { ContractInstance } from '../contracts/ContractInstance'
import {
    ContractABI,
    ContractDeployOptions,
    ContractCallOptions,
    ContractCallResult
} from '../contracts/types/ContractABI'

export class DemosContracts {
    private factory: ContractFactory

    constructor(private demos: Demos) {
        this.factory = new ContractFactory(demos)
    }

    /**
     * Deploy a new smart contract
     * 
     * @example
     * ```typescript
     * const contract = await demos.contracts.deploy(`
     *   class MyToken extends DemosContract {
     *     constructor() {
     *       this.state.set('totalSupply', 1000000)
     *     }
     *   }
     * `)
     * ```
     */
    async deploy(
        source: string,
        constructorArgs: any[] = [],
        options: ContractDeployOptions = {}
    ): Promise<ContractInstance> {
        if (!this.demos.walletConnected) {
            throw new Error('Wallet not connected')
        }

        return await this.factory.deploy(source, constructorArgs, options)
    }

    /**
     * Get an instance of an existing contract
     * 
     * @example
     * ```typescript
     * const contract = await demos.contracts.at('contract_address')
     * const result = await contract.call('balanceOf', ['my_address'])
     * ```
     */
    async at<T = any>(
        address: string,
        abi?: ContractABI
    ): Promise<ContractInstance<T>> {
        return await this.factory.at<T>(address, abi)
    }

    /**
     * Call a contract method directly
     * 
     * @example
     * ```typescript
     * const result = await demos.contracts.call(
     *   'contract_address',
     *   'transfer',
     *   ['recipient', 100]
     * )
     * ```
     */
    async call<T = any>(
        contractAddress: string,
        method: string,
        args: any[] = [],
        options: ContractCallOptions = {}
    ): Promise<ContractCallResult<T>> {
        const instance = await this.at(contractAddress)
        return await instance.call<T>(method, args, options)
    }

    /**
     * Create a batch operation
     * 
     * @example
     * ```typescript
     * const batch = demos.contracts.batch()
     *   .deploy(tokenContract)
     *   .call(existingContract, 'initialize', [])
     *   .call(anotherContract, 'setOwner', [newOwner])
     * 
     * const results = await batch.execute()
     * ```
     */
    batch() {
        return this.factory.batch()
    }

    /**
     * Estimate gas for a contract call
     * 
     * @example
     * ```typescript
     * const gasEstimate = await demos.contracts.estimateGas(
     *   'contract_address',
     *   'transfer',
     *   ['recipient', 100]
     * )
     * ```
     */
    async estimateGas(
        contractAddress: string,
        method: string,
        args: any[] = []
    ): Promise<bigint> {
        return await this.factory.estimateGas(contractAddress, method, args)
    }

    /**
     * Deploy a contract from a template
     * 
     * @example
     * ```typescript
     * const token = await demos.contracts.deployTemplate('ERC20', {
     *   name: 'MyToken',
     *   symbol: 'MTK',
     *   totalSupply: 1000000
     * })
     * ```
     */
    async deployTemplate(
        templateName: string,
        params: Record<string, any> = {}
    ): Promise<ContractInstance> {
        // This will be implemented with standard contract templates
        const templates: Record<string, string> = {
            'Storage': `
                class Storage extends DemosContract {
                    constructor() {
                        super()
                    }
                    
                    store(key: string, value: any) {
                        this.state.set(key, value)
                    }
                    
                    retrieve(key: string) {
                        return this.state.get(key)
                    }
                }
            `,
            'Token': `
                class Token extends DemosContract {
                    constructor(totalSupply: number) {
                        super()
                        this.state.set('totalSupply', totalSupply)
                        this.state.set('balances', {})
                        const creator = this.sender
                        const balances = this.state.get('balances')
                        balances[creator] = totalSupply
                        this.state.set('balances', balances)
                    }
                    
                    transfer(to: string, amount: number) {
                        const from = this.sender
                        const balances = this.state.get('balances')
                        
                        if (!balances[from] || balances[from] < amount) {
                            this.revert('Insufficient balance')
                        }
                        
                        balances[from] -= amount
                        balances[to] = (balances[to] || 0) + amount
                        this.state.set('balances', balances)
                        
                        this.emit('Transfer', { from, to, amount })
                        return true
                    }
                    
                    balanceOf(address: string) {
                        const balances = this.state.get('balances')
                        return balances[address] || 0
                    }
                }
            `
        }

        const template = templates[templateName]
        if (!template) {
            throw new Error(`Unknown template: ${templateName}`)
        }

        // Replace template parameters
        let source = template
        for (const [key, value] of Object.entries(params)) {
            source = source.replace(new RegExp(`{{${key}}}`, 'g'), value)
        }

        return await this.deploy(source, [params.totalSupply || 1000000])
    }
}