interface Content {
    txs: null
    nonce: null
    balance: string
    identities: null
}

interface Details {
    hash: string
    content: Content
}

interface Extended {
    xm: any[]
    nfts: any[]
    web2: any[]
    other: any[]
    tokens: any[]
}

export interface AddressInfo {
    id: number
    publicKey: string
    details: Details
    extended: Extended
}
