declare module 'falcon-sign' {
    export interface FalconKeypair {
        genkeySeed: Uint8Array;
        pk: Uint8Array;
        sk: Uint8Array;
    }

    export interface FalconKernel {
        algid: string;
        genkeySeedByte: number;
        skByte: number;
        pkByte: number;
        signByte: number;
        signSaltByte: number;
        signNonceByte: number;
        genkey(genkeySeed?: Uint8Array): FalconKeypair;
        publicKeyCreate(sk: Uint8Array): Uint8Array;
        sign(message: Uint8Array | string, sk: Uint8Array, salt?: Uint8Array): Uint8Array;
        verify(signMsg: Uint8Array, message: Uint8Array | string, pk: Uint8Array): boolean;
    }

    export function getKernel(algid?: string): Promise<FalconKernel>;
    export function getKernelNameList(): string[];

    export const util: {
        isUint8Array(data: any): boolean;
        isUint(data: any): boolean;
        uint8ArrayToString(buf: Uint8Array, decode?: string): string;
        base64ToUint8Array(data: string): Uint8Array | undefined;
        hexStringToUint8Array(data: string): Uint8Array | undefined;
        uint8ArrayConcat(bufs: Uint8Array[]): Uint8Array;
        uint8ArrayEqual(buf1: Uint8Array, buf2: Uint8Array): boolean;
        randomBytes(size: number): Uint8Array;
        hexToUint8Array(hex: string): Uint8Array;
        uint8ArrayToHex(uint8Array: Uint8Array): string;
    };
} 