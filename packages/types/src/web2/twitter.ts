export interface TwitterUser {
    rest_id: string;
    name: string;
    screen_name: string;
    avatar?: string;
    blue_verified: boolean;
    image?: string;
}

export interface MediaSize {
    h: number;
    w: number;
    resize?: string;
}

export interface MediaSizes {
    large: MediaSize;
    medium: MediaSize;
    small: MediaSize;
    thumb: MediaSize;
}

export interface VideoVariant {
    content_type: string;
    url: string;
    bitrate?: number;
}

export interface VideoInfo {
    aspect_ratio: number[];
    duration_millis?: number;
    variants: VideoVariant[];
}

export interface MediaItem {
    media_url_https: string;
    id: string;
    sizes?: MediaSizes;
    variants?: VideoVariant[];
    aspect_ratio?: number[];
    original_info?: {
        height: number;
        width: number;
        focus_rects?: any[];
    };
    video_info?: VideoInfo;
}

export interface Media {
    photo?: MediaItem[];
    video?: MediaItem[];
}

export interface TweetEntities {
    hashtags: any[];
    symbols: any[];
    timestamps: any[];
    urls: any[];
    user_mentions: Array<{
        id_str: string;
        name: string;
        screen_name: string;
    }>;
    media?: Array<{
        display_url: string;
        expanded_url: string;
        id_str: string;
        indices: number[];
        media_key: string;
        media_url_https: string;
        type: string;
        url: string;
        ext_media_availability?: {
            status: string;
        };
        features?: any;
        sizes?: MediaSizes;
        original_info?: {
            height: number;
            width: number;
            focus_rects?: any[];
        };
        allow_download_status?: {
            allow_download: boolean;
        };
        video_info?: VideoInfo;
        media_results?: {
            result: {
                media_key: string;
            };
        };
        additional_media_info?: {
            monetizable: boolean;
            source_user?: any;
        };
        source_status_id_str?: string;
        source_user_id_str?: string;
    }>;
}

export interface Tweet {
    tweet_id: string;
    bookmarks: number;
    created_at: string;
    favorites: number;
    text: string;
    lang: string;
    views: string;
    quotes: number;
    replies: number;
    retweets: number;
    conversation_id: string;
    media: Media;
    author: TwitterUser;
    entities?: TweetEntities;
    quoted?: Tweet;
    retweeted?: {
        id: string;
    };
    retweeted_tweet?: Tweet;
}

export interface UserAffiliates {
    label: {
        url: {
            url: string;
            urlType: string;
        };
        badge: {
            url: string;
        };
        description: string;
        userLabelType: string;
        userLabelDisplayType?: string;
    };
}

export interface TwitterProfile {
    status: string;
    profile: string;
    rest_id: string;
    blue_verified: boolean;
    affiliates: UserAffiliates;
    business_account: any[];
    avatar: string;
    header_image: string;
    desc: string;
    name: string;
    protected: boolean | null;
    location: string;
    friends: number;
    sub_count: number;
    statuses_count: number;
    media_count: number;
    created_at: string;
    pinned_tweet_ids_str: string[];
    id: string;
}

export interface TwitterTimelineResponse {
    pinned: Tweet;
    timeline: Tweet[];
    next_cursor: string;
    prev_cursor: string;
    status: string;
    user: TwitterProfile;
}


export interface TweetSimplified {
    id: string
    created_at: string
    text: string
    username: string
    userId: string
}

export interface TwitterFollower {
    user_id: string;
    screen_name: string;
    description: string;
    profile_image: string;
    statuses_count: number;
    followers_count: number;
    friends_count: number;
    media_count: number;
    name: string;
}

export interface TwitterFollowersResponse {
    followers: TwitterFollower[];
    next_cursor: string;
}