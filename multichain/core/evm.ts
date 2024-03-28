import { Contract, TransactionReceipt } from 'ethers';

/**
 * Base methods for the EVM Default Chain SDK
 */
export interface IEVMDefaultChain {
	contracts: Map<string, Contract>;
	isEIP1559: boolean;
	chainId: number;

	prepareBaseTxWithType: () => Promise<any>;
	getContractInstance: (address: string, abi: string) => Promise<Contract>;
	createRawTransaction: (tx_data: any) => Promise<any>;
	readFromContract: (contract: any, method: string, args: any) => Promise<any>;
	writeToContract: (contract: any, method: string, args: any) => Promise<any>;
	listenForEvent: (event: string, contract: string, abi: any[]) => Promise<any>;
	listenForAllEvents: (contract: string, abi: any[]) => Promise<any>;
	waitForReceipt: (tx_hash: string) => Promise<TransactionReceipt>;
}
