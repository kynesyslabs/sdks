/**
 * Contract instance wrapper for easy interaction
 */

import { Demos } from '../websdk/demosclass'
import { ContractInteractor } from './ContractInteractor'
import { 
    ContractCallResult, 
    ContractCallOptions,
    ContractABI 
} from './types/ContractABI'
import { ContractInstance as IContractInstance } from './types/TypedContract'

export class ContractInstance<T = any> implements IContractInstance<T> {
    private interactor: ContractInteractor
    public methods: T = {} as T

    constructor(
        private demos: Demos,
        public address: string,
        public abi?: ContractABI
    ) {
        this.interactor = new ContractInteractor(demos)
        
        // Set up method proxies if ABI is provided
        if (abi && abi.functions) {
            this.setupMethodProxies()
        }

        // Set up general proxy for dynamic method calls
        return new Proxy(this, {
            get: (target, prop) => {
                // Return existing properties
                if (prop in target) {
                    return target[prop as keyof ContractInstance<T>]
                }

                // Create dynamic method caller
                if (typeof prop === 'string' && !prop.startsWith('_')) {
                    return (...args: any[]) => this.call(prop, args)
                }

                return undefined
            }
        }) as ContractInstance<T>
    }

    /**
     * Call a contract method
     */
    async call<R = any>(
        method: string, 
        args: any[] = [], 
        options?: ContractCallOptions
    ): Promise<ContractCallResult<R>> {
        return await this.interactor.call<R>(
            this.address,
            method,
            args,
            options
        )
    }

    /**
     * Send DEM with a contract call
     */
    async callWithValue<R = any>(
        method: string,
        args: any[],
        value: bigint | number,
        options?: ContractCallOptions
    ): Promise<ContractCallResult<R>> {
        return await this.call<R>(method, args, {
            ...options,
            value
        })
    }

    /**
     * Get contract state (if accessible)
     */
    async getState(key?: string): Promise<any> {
        if (key) {
            return await this.call('getState', [key])
        }
        return await this.call('getState', [])
    }

    /**
     * Get contract metadata
     */
    async getMetadata(): Promise<any> {
        const result = await this.demos.rpcCall({
            method: 'getContractMetadata',
            params: [this.address]
        } as any)

        return result.result === 200 ? result.response : null
    }

    /**
     * Get contract events
     */
    async getEvents(params?: {
        eventName?: string
        fromBlock?: number
        toBlock?: number
        limit?: number
    }): Promise<any[]> {
        const result = await this.demos.rpcCall({
            method: 'getContractEvents',
            params: [{
                contractAddress: this.address,
                ...params
            }]
        } as any)

        return result.result === 200 ? result.response.events : []
    }

    /**
     * Setup method proxies based on ABI
     */
    private setupMethodProxies(): void {
        if (!this.abi || !this.abi.functions) return

        for (const func of this.abi.functions) {
            if (func.visibility === 'public') {
                (this.methods as any)[func.name] = async (...args: any[]) => {
                    // Validate argument count
                    const requiredParams = func.parameters.filter(p => !p.optional).length
                    if (args.length < requiredParams) {
                        throw new Error(
                            `Method ${func.name} expects at least ${requiredParams} arguments, got ${args.length}`
                        )
                    }

                    // Determine if this is a view call
                    const isView = func.mutability === 'view' || func.mutability === 'pure'
                    const options: ContractCallOptions = {}
                    
                    if (func.mutability === 'payable' && args.length > func.parameters.length) {
                        // Last argument might be value
                        options.value = args.pop()
                    }

                    const result = await this.call(func.name, args, options)
                    
                    if (result.success) {
                        return result.result
                    } else {
                        throw new Error(result.error || `Call to ${func.name} failed`)
                    }
                }
            }
        }
    }

    /**
     * Create a typed instance from ABI
     */
    static fromABI<T>(
        demos: Demos,
        address: string,
        abi: ContractABI
    ): ContractInstance<T> {
        return new ContractInstance<T>(demos, address, abi)
    }

    /**
     * Wait for contract to be deployed at address
     */
    static async waitForDeployment(
        demos: Demos,
        address: string,
        timeout: number = 30000
    ): Promise<boolean> {
        const startTime = Date.now()

        while (Date.now() - startTime < timeout) {
            const result = await demos.rpcCall({
                method: 'getContract',
                params: [address]
            } as any)

            if (result.result === 200 && result.response) {
                return true
            }

            await new Promise(resolve => setTimeout(resolve, 1000))
        }

        return false
    }
}