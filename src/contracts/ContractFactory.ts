/**
 * Factory for creating contract instances
 */

import { Demos } from '../websdk/demosclass'
import { ContractDeployer } from './ContractDeployer'
import { ContractInteractor } from './ContractInteractor'
import { ContractInstance } from './ContractInstance'
import { ContractABI, ContractDeployOptions } from './types/ContractABI'

export class ContractFactory {
    private deployer: ContractDeployer
    private interactor: ContractInteractor

    constructor(private demos: Demos) {
        this.deployer = new ContractDeployer(demos)
        this.interactor = new ContractInteractor(demos)
    }

    /**
     * Deploy a new contract
     */
    async deploy(
        source: string,
        constructorArgs: any[] = [],
        options: ContractDeployOptions = {}
    ): Promise<ContractInstance> {
        return await this.deployer.deployAndWrap(source, constructorArgs, options)
    }

    /**
     * Get an instance of an existing contract
     */
    async at<T = any>(
        address: string,
        abi?: ContractABI
    ): Promise<ContractInstance<T>> {
        return new ContractInstance<T>(this.demos, address, abi)
    }

    /**
     * Create a batch operation builder
     */
    batch(): BatchBuilder {
        return new BatchBuilder(this.demos, this.deployer, this.interactor)
    }

    /**
     * Estimate gas for a contract call
     */
    async estimateGas(
        contractAddress: string,
        method: string,
        args: any[] = []
    ): Promise<bigint> {
        const result = await this.demos.rpcCall({
            method: 'estimateGas',
            params: [{
                contractAddress,
                method,
                args
            }]
        })

        if (result.result === 200) {
            return BigInt(result.response.gasEstimate || 0)
        }

        throw new Error('Failed to estimate gas')
    }
}

/**
 * Batch operation builder
 */
export class BatchBuilder {
    private operations: Array<() => Promise<any>> = []

    constructor(
        private demos: Demos,
        private deployer: ContractDeployer,
        private interactor: ContractInteractor
    ) {}

    /**
     * Add a deployment to the batch
     */
    deploy(
        source: string,
        constructorArgs: any[] = [],
        options: ContractDeployOptions = {}
    ): BatchBuilder {
        this.operations.push(async () => 
            await this.deployer.deploy(source, constructorArgs, options)
        )
        return this
    }

    /**
     * Add a contract call to the batch
     */
    call(
        contractAddress: string,
        method: string,
        args: any[] = []
    ): BatchBuilder {
        this.operations.push(async () =>
            await this.interactor.call(contractAddress, method, args)
        )
        return this
    }

    /**
     * Execute all operations in the batch
     */
    async execute(): Promise<any[]> {
        const results = []
        for (const operation of this.operations) {
            try {
                const result = await operation()
                results.push(result)
            } catch (error) {
                results.push({
                    success: false,
                    error: (error as Error).message
                })
            }
        }
        return results
    }
}