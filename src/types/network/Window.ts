export interface AbstractProvider {
    sendAsync: (
        payload: any,
        callback: (error: any, response: any) => void,
    ) => void
    send?: (payload: any, callback: (error: any, response: any) => void) => void
    request?: (args: { method: string; params?: any[] }) => Promise<any>
}

declare global {
    interface Window {
        ethereum?: AbstractProvider
    }
}

export {}
