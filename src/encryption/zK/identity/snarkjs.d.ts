declare module 'snarkjs' {
    interface Groth16Proof {
        pi_a: string[];
        pi_b: string[][];
        pi_c: string[];
        protocol: string;
        curve?: string;
    }

    export const groth16: {
        fullProve(
            input: Record<string, unknown>,
            wasmFile: string,
            zkeyFileName: string,
            logger?: unknown,
        ): Promise<{ proof: Groth16Proof; publicSignals: string[] }>;
        verify(
            vk: unknown,
            publicSignals: string[],
            proof: Groth16Proof,
            logger?: unknown,
        ): Promise<boolean>;
    };
}
