/**
 * Assume this is how a web2 request looks like
 */
export interface Web2Request {
    url: string
    method: "GET" | "POST" | "PUT" | "DELETE"
    data?: Object
}

export interface DemosWeb2StepOutput {
    statusCode: number
    payload: Object
}
