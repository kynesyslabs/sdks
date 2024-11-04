import forge from "node-forge";
import { IncomingHttpHeaders, OutgoingHttpHeaders } from "http"

export interface IParam {
    name: string;
    value: any;
}
export interface IWeb2Payload {
    type: "web2Request";
    message: IWeb2Request;
    sender: any;
    receiver: any;
    timestamp: any;
    data: any;
    extra: any;
}
export interface IWeb2Result {
    status: number
    statusText: string
    headers: IncomingHttpHeaders
    data: any
}
export interface IWeb2Request {
    raw: IRawWeb2Request;
    result: any;
    attestations: {};
    hash: string;
    signature?: forge.pki.ed25519.BinaryBuffer;
}
export declare enum EnumWeb2Methods {
    GET = "GET",
    POST = "POST",
    PUT = "PUT",
    DELETE = "DELETE",
    PATCH = "PATCH"
}
export interface IRawWeb2Request {
    action: string;
    parameters: IParam[];
    requestedParameters: [] | null;
    method: EnumWeb2Methods;
    url: string;
    headers: OutgoingHttpHeaders;
    minAttestations: number;
    stage: {
        origin: {
            identity: forge.pki.ed25519.BinaryBuffer;
            connection_url: string;
        };
        hop_number: number;
    };
}
export interface IWeb2Attestation {
    hash: string;
    timestamp: number;
    identity: forge.pki.PublicKey;
    signature: forge.pki.ed25519.BinaryBuffer;
    valid: boolean;
}
