export interface Account {
    pubkey: string;
    assignedTxs: string[];
    nonce: number;
    balance: string;
    identities: AccountIdentities;
    points: AccountPoints;
    referralInfo: ReferralInfo;
    flagged: boolean;
    flaggedReason: string;
    reviewed: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface AccountIdentities {
    xm: XMIdentities;
    pqc: Record<string, never>;
    web2: Web2Identities;
}

export interface XMIdentities {
    evm: ChainIdentities;
    solana: ChainIdentities;
}

export interface ChainIdentities {
    mainnet: IdentityLink[];
}

export interface IdentityLink {
    address: string;
    publicKey: string;
    signature: string;
    timestamp: number;
    signedData: string;
}

export interface Web2Identities {
    twitter: TwitterIdentity[];
}

export interface TwitterIdentity {
    proof: string;
    userId: string;
    username: string;
    proofHash: string;
    timestamp: number;
}

export interface AccountPoints {
    breakdown: PointsBreakdown;
    lastUpdated: string;
    totalPoints: number;
}

export interface PointsBreakdown {
    referrals: number;
    web3Wallets: Web3WalletPoints;
    socialAccounts: SocialAccountPoints;
}

export interface Web3WalletPoints {
    evm: number;
    solana: number;
}

export interface SocialAccountPoints {
    github: number;
    discord: number;
    twitter: number;
}

export interface ReferralInfo {
    referrals: string[];
    referredBy: string;
    referralCode: string;
    totalReferrals: number;
}

