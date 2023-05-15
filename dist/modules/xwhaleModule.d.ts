import { TransactionBlock } from '@mysten/sui.js';
import { CancelRedeemParams, ConvertParams, DividendManager, DividendManagerEvent, LockUpManagerEvent, LockWhale, RedeemLockParams, RedeemParams, VeNFT, VeNFTDividendInfo, XwhaleInitEvent, XwhaleManager } from '../types/xwhale_type';
import { SuiAddressType, SuiObjectIdType } from '../types/sui';
import { SDK } from '../sdk';
import { IModule } from '../interfaces/IModule';
import { CoinAsset } from './resourcesModule';
export declare const cacheTime5min: number;
export declare const cacheTime24h: number;
export declare const intervalFaucetTime: number;
export declare class XWhaleModule implements IModule {
    protected _sdk: SDK;
    private readonly _cache;
    constructor(sdk: SDK);
    get sdk(): SDK;
    getOwnerVeNFT(accountAddress: SuiAddressType, forceRefresh?: boolean): Promise<VeNFT | undefined>;
    getOwnerLockWhales(accountAddress: SuiAddressType): Promise<LockWhale[]>;
    getLockWhale(lock_id: SuiObjectIdType): Promise<LockWhale | undefined>;
    getOwnerWhaleCoins(accountAddress: SuiAddressType): Promise<CoinAsset[]>;
    /**
     * mint venft
     * @returns
     */
    mintVeNFTPayload(): TransactionBlock;
    /**
     * Convert Whale to Xwhale.
     * @param params
     * @returns
     */
    convertPayload(params: ConvertParams): Promise<TransactionBlock>;
    /**
     * Convert Xwhale to Whale, first step is to lock the Whale for a period.
     * When the time is reach, whale can be redeem and xwhale will be burned.
     * @param params
     * @returns
     */
    redeemLockPayload(params: RedeemLockParams): TransactionBlock;
    /**
     * lock time is reach and the whale can be redeemed, the xwhale will be burned.
     * @param params
     * @returns
     */
    redeemPayload(params: RedeemParams): TransactionBlock;
    redeemDividendPayload(venft_id: SuiObjectIdType, bonus_types: SuiAddressType[]): TransactionBlock;
    buileWhaleCoinType(): SuiAddressType;
    /**
     * Cancel the redeem lock, the whale locked will be return back to the manager and the xwhale will be available again.
     * @param params
     * @returns
     */
    cancelRedeemPayload(params: CancelRedeemParams): TransactionBlock;
    getInitFactoryEvent(): Promise<XwhaleInitEvent>;
    getLockUpManagerEvent(): Promise<LockUpManagerEvent>;
    getDividendManagerEvent(): Promise<DividendManagerEvent>;
    getDividendManager(forceRefresh?: boolean): Promise<DividendManager>;
    getXwhaleManager(): Promise<XwhaleManager>;
    getVeNFTDividendInfo(venft_dividends_handle: string, venft_id: SuiObjectIdType): Promise<VeNFTDividendInfo | undefined>;
    redeemNum(redeemAmount: string | number, lock_day: number): Promise<{
        amountOut: string;
        percent: number;
    }>;
    private reverseRedeemNum;
    private updateCache;
}
