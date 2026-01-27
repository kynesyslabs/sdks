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
import { TemplateRegistry } from '../contracts/templates/TemplateRegistry'

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
     * const token = await demos.contracts.deployTemplate('Token', {
     *   TOKEN_NAME: 'MyToken',
     *   TOKEN_SYMBOL: 'MTK',
     *   TOTAL_SUPPLY: 1000000,
     *   DECIMALS: 18
     * })
     * ```
     */
    async deployTemplate(
        templateName: string,
        params: Record<string, any> = {}
    ): Promise<ContractInstance> {
        if (!this.demos.walletConnected) {
            throw new Error('Wallet not connected')
        }

        // Generate contract source from template
        const result = TemplateRegistry.generateContract(templateName, params)
        
        if (!result.success) {
            const errorMessage = result.errors.join('; ')
            throw new Error(`Template deployment failed: ${errorMessage}`)
        }

        // Extract constructor arguments based on template
        const constructorArgs = this.extractConstructorArgs(templateName, params)

        // Deploy the generated contract
        return await this.deploy(result.source!, constructorArgs)
    }

    /**
     * Get available contract templates
     * 
     * @example
     * ```typescript
     * const templates = demos.contracts.getAvailableTemplates()
     * // ['Token', 'Storage']
     * ```
     */
    getAvailableTemplates(): string[] {
        return TemplateRegistry.getAvailableTemplates()
    }

    /**
     * Get template information and parameters
     * 
     * @example
     * ```typescript
     * const schema = demos.contracts.getTemplateSchema('Token')
     * console.log(schema.parameters) // List of required/optional parameters
     * ```
     */
    getTemplateSchema(templateName: string) {
        return TemplateRegistry.getTemplateSchema(templateName)
    }

    /**
     * Validate template parameters before deployment
     * 
     * @example
     * ```typescript
     * const validation = demos.contracts.validateTemplate('Token', {
     *   TOKEN_NAME: 'MyToken',
     *   TOTAL_SUPPLY: 1000000
     * })
     * 
     * if (!validation.valid) {
     *   console.error('Validation errors:', validation.errors)
     * }
     * ```
     */
    validateTemplate(templateName: string, params: Record<string, any>) {
        return TemplateRegistry.validateParameters(templateName, params)
    }

    /**
     * Get usage example for a template
     * 
     * @example
     * ```typescript
     * const example = demos.contracts.getTemplateExample('Token')
     * console.log(example) // Shows deployment and usage example
     * ```
     */
    getTemplateExample(templateName: string): string | null {
        return TemplateRegistry.getTemplateExample(templateName)
    }

    /**
     * Extract constructor arguments from template parameters
     */
    private extractConstructorArgs(_templateName: string, _params: Record<string, any>): any[] {
        // Templates now have parameters embedded in constructor,
        // so we don't need to pass separate constructor args
        return []
    }
}