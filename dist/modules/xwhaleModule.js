/* eslint-disable no-await-in-loop */
/* eslint-disable camelcase */
import { getMoveObjectType, getObjectFields, TransactionBlock } from '@mysten/sui.js';
import Decimal from 'decimal.js';
import { XWhaleUtil } from '../utils/xwhale';
import { DividendsRouterModule, EXCHANGE_RATE_MULTIPER, REDEEM_NUM_MULTIPER, XwhaleRouterModule, } from '../types/xwhale_type';
import { buildNFT, TransactionUtil } from '../utils';
import { CLOCK_ADDRESS } from '../types/sui';
import { CachedContent } from '../utils/cachedContent';
import { d } from '../utils/numbers';
import { extractStructTagFromType } from '../utils/contracts';
export const cacheTime5min = 5 * 60 * 1000;
export const cacheTime24h = 24 * 60 * 60 * 1000;
export const intervalFaucetTime = 12 * 60 * 60 * 1000;
function getFutureTime(interval) {
    return Date.parse(new Date().toString()) + interval;
}
export class XWhaleModule {
    _sdk;
    _cache = {};
    constructor(sdk) {
        this._sdk = sdk;
    }
    get sdk() {
        return this._sdk;
    }
    async getOwnerVeNFT(accountAddress, forceRefresh = true) {
        const { xwhale } = this.sdk.sdkOptions;
        const cacheKey = `${accountAddress}_getLockUpManagerEvent`;
        const cacheData = this._cache[cacheKey];
        if (!forceRefresh && cacheData !== undefined && cacheData.getCacheData()) {
            return cacheData.value;
        }
        let cursor = null;
        let veNFT;
        while (true) {
            // eslint-disable-next-line no-await-in-loop
            const ownerRes = await this._sdk.fullClient.getOwnedObjects({
                owner: accountAddress,
                options: { showType: true, showContent: true, showDisplay: true },
                cursor,
                // filter: { StructType: `${xwhale.xwhale_router}::xwhale::VeNFT` },
            });
            // eslint-disable-next-line no-loop-func
            ownerRes.data?.forEach((item) => {
                const type = extractStructTagFromType(getMoveObjectType(item)).source_address;
                if (type === `${xwhale.xwhale_display}::xwhale::VeNFT`) {
                    if (item.data && item.data.content) {
                        const { fields } = item.data.content;
                        veNFT = {
                            ...buildNFT(item),
                            id: fields.id.id,
                            index: fields.index,
                            type,
                            xwhale_balance: fields.xwhale_balance,
                        };
                        this.updateCache(cacheKey, veNFT, cacheTime24h);
                    }
                }
            });
            if (ownerRes.hasNextPage) {
                cursor = ownerRes.nextCursor;
            }
            else {
                break;
            }
        }
        return veNFT;
    }
    async getOwnerLockWhales(accountAddress) {
        const { xwhale } = this.sdk.sdkOptions;
        const lockWhales = [];
        let cursor = null;
        while (true) {
            const ownerRes = (await this._sdk.fullClient.getOwnedObjects({
                owner: accountAddress,
                options: { showType: true, showContent: true },
                cursor,
                // filter: { StructType: `${xwhale.xwhale_router}::lock_coin::LockedCoin<${this.buileWhaleCoinType()}>` },
            })).data;
            for (const item of ownerRes) {
                const type = extractStructTagFromType(getMoveObjectType(item)).source_address;
                if (type === `${xwhale.xwhale_display}::lock_coin::LockedCoin<${this.buileWhaleCoinType()}>`) {
                    if (item.data) {
                        const lockWhale = XWhaleUtil.buildLockWhale(item.data.content);
                        lockWhale.xwhale_amount = await this.reverseRedeemNum(lockWhale.whale_amount, lockWhale.lock_day);
                        lockWhales.push(lockWhale);
                    }
                }
            }
            if (ownerRes.hasNextPage) {
                cursor = ownerRes.nextCursor;
            }
            else {
                break;
            }
        }
        return lockWhales;
    }
    async getLockWhale(lock_id) {
        const result = await this._sdk.fullClient.getObject({ id: lock_id, options: { showType: true, showContent: true } });
        if (result.data?.content) {
            const lockWhale = XWhaleUtil.buildLockWhale(result.data.content);
            lockWhale.xwhale_amount = await this.reverseRedeemNum(lockWhale.whale_amount, lockWhale.lock_day);
            return lockWhale;
        }
        return undefined;
    }
    async getOwnerWhaleCoins(accountAddress) {
        const coins = await this._sdk.Resources.getOwnerCoinAssets(accountAddress, this.buileWhaleCoinType());
        return coins;
    }
    /**
     * mint venft
     * @returns
     */
    mintVeNFTPayload() {
        const { xwhale } = this.sdk.sdkOptions;
        const tx = new TransactionBlock();
        tx.setGasBudget(this._sdk.gasConfig.GasBudgetLow);
        tx.moveCall({
            target: `${xwhale.xwhale_router}::${XwhaleRouterModule}::mint_venft`,
            typeArguments: [],
            arguments: [tx.pure(xwhale.config.xwhale_manager_id)],
        });
        return tx;
    }
    /**
     * Convert Whale to Xwhale.
     * @param params
     * @returns
     */
    async convertPayload(params) {
        const { xwhale } = this.sdk.sdkOptions;
        const tx = new TransactionBlock();
        const coin_type = this.buileWhaleCoinType();
        const primaryCoinInputs = (await TransactionUtil.syncBuildCoinInputForAmount(this._sdk, tx, BigInt(params.amount), coin_type));
        if (params.venft_id === undefined) {
            tx.setGasBudget(this._sdk.gasConfig.GasBudgetHigh);
            tx.moveCall({
                target: `${xwhale.xwhale_router}::${XwhaleRouterModule}::mint_and_convert`,
                typeArguments: [coin_type],
                arguments: [
                    tx.object(xwhale.config.lock_manager_id),
                    tx.object(xwhale.config.xwhale_manager_id),
                    primaryCoinInputs,
                    tx.pure(params.amount),
                ],
            });
        }
        else {
            tx.setGasBudget(this._sdk.gasConfig.GasBudgetLow);
            tx.moveCall({
                target: `${xwhale.xwhale_router}::${XwhaleRouterModule}::convert`,
                typeArguments: [coin_type],
                arguments: [
                    tx.object(xwhale.config.lock_manager_id),
                    tx.object(xwhale.config.xwhale_manager_id),
                    primaryCoinInputs,
                    tx.pure(params.amount),
                    tx.pure(params.venft_id),
                ],
            });
        }
        return tx;
    }
    /**
     * Convert Xwhale to Whale, first step is to lock the Whale for a period.
     * When the time is reach, whale can be redeem and xwhale will be burned.
     * @param params
     * @returns
     */
    redeemLockPayload(params) {
        const { xwhale } = this.sdk.sdkOptions;
        const tx = new TransactionBlock();
        tx.setGasBudget(this._sdk.gasConfig.GasBudgetLow);
        tx.moveCall({
            target: `${xwhale.xwhale_router}::${XwhaleRouterModule}::redeem_lock`,
            typeArguments: [this.buileWhaleCoinType()],
            arguments: [
                tx.pure(xwhale.config.lock_manager_id),
                tx.pure(xwhale.config.xwhale_manager_id),
                tx.pure(params.venft_id),
                tx.pure(params.amount),
                tx.pure(params.lock_day),
                tx.pure(CLOCK_ADDRESS),
            ],
        });
        return tx;
    }
    /**
     * lock time is reach and the whale can be redeemed, the xwhale will be burned.
     * @param params
     * @returns
     */
    redeemPayload(params) {
        const { xwhale } = this.sdk.sdkOptions;
        const tx = new TransactionBlock();
        tx.setGasBudget(this._sdk.gasConfig.GasBudgetLow);
        tx.moveCall({
            target: `${xwhale.xwhale_router}::${XwhaleRouterModule}::redeem`,
            typeArguments: [this.buileWhaleCoinType()],
            arguments: [
                tx.pure(xwhale.config.lock_manager_id),
                tx.pure(xwhale.config.xwhale_manager_id),
                tx.pure(params.venft_id),
                tx.pure(params.lock_id),
                tx.pure(CLOCK_ADDRESS),
            ],
        });
        return tx;
    }
    redeemDividendPayload(venft_id, bonus_types) {
        const { xwhale } = this.sdk.sdkOptions;
        const tx = new TransactionBlock();
        tx.setGasBudget(this._sdk.gasConfig.GasBudgetLow);
        bonus_types.forEach((coin) => {
            tx.moveCall({
                target: `${xwhale.dividends_router}::${DividendsRouterModule}::redeem`,
                typeArguments: [coin],
                arguments: [tx.object(xwhale.config.dividend_manager_id), tx.object(venft_id)],
            });
        });
        return tx;
    }
    buileWhaleCoinType() {
        return `${this.sdk.sdkOptions.xwhale.whale_faucet}::whale::WHALE`;
    }
    /**
     * Cancel the redeem lock, the whale locked will be return back to the manager and the xwhale will be available again.
     * @param params
     * @returns
     */
    cancelRedeemPayload(params) {
        const { xwhale } = this.sdk.sdkOptions;
        const tx = new TransactionBlock();
        tx.setGasBudget(this._sdk.gasConfig.GasBudgetLow);
        tx.moveCall({
            target: `${xwhale.xwhale_router}::${XwhaleRouterModule}::cancel_redeem_lock`,
            typeArguments: [this.buileWhaleCoinType()],
            arguments: [
                tx.pure(xwhale.config.lock_manager_id),
                tx.pure(xwhale.config.xwhale_manager_id),
                tx.pure(params.venft_id),
                tx.pure(params.lock_id),
                tx.pure(CLOCK_ADDRESS),
            ],
        });
        return tx;
    }
    async getInitFactoryEvent() {
        const { xwhale_display } = this.sdk.sdkOptions.xwhale;
        const initEventObjects = (await this._sdk.fullClient.queryEvents({ query: { MoveEventType: `${xwhale_display}::xwhale::InitEvent` } }))
            .data;
        const initEvent = {
            xwhale_manager_id: '',
        };
        if (initEventObjects.length > 0) {
            initEventObjects.forEach((item) => {
                const fields = item.parsedJson;
                if (fields) {
                    initEvent.xwhale_manager_id = fields.xwhale_manager;
                }
            });
        }
        return initEvent;
    }
    async getLockUpManagerEvent() {
        const { xwhale_display } = this.sdk.sdkOptions.xwhale;
        const cacheKey = `${xwhale_display}_getLockUpManagerEvent`;
        const cacheData = this._cache[cacheKey];
        if (cacheData !== undefined && cacheData.getCacheData()) {
            return cacheData.value;
        }
        const lockEventObjects = (await this._sdk.fullClient.queryEvents({ query: { MoveEventType: `${xwhale_display}::locking::InitializeEvent` } })).data;
        //  console.log('lockEventObjects: ', lockEventObjects)
        const initEvent = {
            lock_manager_id: '',
            max_lock_day: 0,
            max_percent_numerator: 0,
            min_lock_day: 0,
            min_percent_numerator: 0,
        };
        if (lockEventObjects.length > 0) {
            lockEventObjects.forEach((item) => {
                const fields = item.parsedJson;
                if (fields) {
                    initEvent.lock_manager_id = fields.lock_manager;
                    initEvent.max_lock_day = Number(fields.max_lock_day);
                    initEvent.max_percent_numerator = Number(fields.max_percent_numerator);
                    initEvent.min_lock_day = Number(fields.min_lock_day);
                    initEvent.min_percent_numerator = Number(fields.min_percent_numerator);
                    this.updateCache(cacheKey, initEvent, cacheTime24h);
                }
            });
        }
        return initEvent;
    }
    async getDividendManagerEvent() {
        const { dividends_display } = this.sdk.sdkOptions.xwhale;
        const cacheKey = `${dividends_display}_getDividendManagerEvent`;
        const cacheData = this._cache[cacheKey];
        if (cacheData !== undefined && cacheData.getCacheData()) {
            return cacheData.value;
        }
        const lockEventObjects = (await this._sdk.fullClient.queryEvents({ query: { MoveEventType: `${dividends_display}::dividend::InitializeEvent` } })).data;
        const initEvent = {
            dividend_manager_id: '',
        };
        if (lockEventObjects.length > 0) {
            lockEventObjects.forEach((item) => {
                const fields = item.parsedJson;
                if (fields) {
                    initEvent.dividend_manager_id = fields.manager_id;
                    this.updateCache(cacheKey, initEvent, cacheTime24h);
                }
            });
        }
        return initEvent;
    }
    async getDividendManager(forceRefresh = false) {
        const { dividend_manager_id } = this.sdk.sdkOptions.xwhale.config;
        const cacheKey = `${dividend_manager_id}_getDividendManager`;
        const cacheData = this._cache[cacheKey];
        if (!forceRefresh && cacheData !== undefined && cacheData.getCacheData()) {
            return cacheData.value;
        }
        const objects = await this._sdk.fullClient.getObject({ id: dividend_manager_id, options: { showContent: true } });
        const fields = getObjectFields(objects);
        const dividendManager = XWhaleUtil.buildDividendManager(fields);
        this.updateCache(cacheKey, dividendManager, cacheTime24h);
        return dividendManager;
    }
    async getXwhaleManager() {
        const { xwhale } = this.sdk.sdkOptions;
        const result = await this._sdk.fullClient.getObject({ id: xwhale.config.xwhale_manager_id, options: { showContent: true } });
        const fields = getObjectFields(result);
        const xwhaleManager = {
            id: fields.id.id,
            index: Number(fields.index),
            has_venft: {
                handle: fields.has_venft.fields.id.id,
                size: fields.has_venft.fields.size,
            },
            nfts: {
                handle: fields.nfts.fields.id.id,
                size: fields.nfts.fields.size,
            },
            total_locked: fields.total_locked,
            treasury: fields.treasury.fields.total_supply.fields.value,
        };
        return xwhaleManager;
    }
    async getVeNFTDividendInfo(venft_dividends_handle, venft_id) {
        try {
            const venft_dividends = await this._sdk.fullClient.getDynamicFieldObject({
                parentId: venft_dividends_handle,
                name: {
                    type: '0x2::object::ID',
                    value: venft_id,
                },
            });
            const fields = getObjectFields(venft_dividends);
            const veNFTDividendInfo = XWhaleUtil.buildVeNFTDividendInfo(fields);
            return veNFTDividendInfo;
        }
        catch (error) {
            return undefined;
        }
    }
    async redeemNum(redeemAmount, lock_day) {
        if (BigInt(redeemAmount) === BigInt(0)) {
            return { amountOut: '0', percent: 0 };
        }
        const lockUpManager = await this.getLockUpManagerEvent();
        if (lockUpManager.max_lock_day === lockUpManager.min_lock_day) {
            return {
                amountOut: d(redeemAmount)
                    .mul(d(EXCHANGE_RATE_MULTIPER))
                    .div(d(lockUpManager.min_percent_numerator))
                    .div(REDEEM_NUM_MULTIPER)
                    .toString(),
                percent: 0,
            };
        }
        const mid = d(REDEEM_NUM_MULTIPER)
            .mul(d(lockUpManager.max_lock_day).sub(d(lock_day)))
            .mul(d(lockUpManager.max_percent_numerator).sub(d(lockUpManager.min_percent_numerator)))
            .div(d(lockUpManager.max_lock_day).sub(d(lockUpManager.min_lock_day)));
        const percent = d(REDEEM_NUM_MULTIPER)
            .mul(d(lockUpManager.max_percent_numerator))
            .sub(mid)
            .div(d(EXCHANGE_RATE_MULTIPER))
            .div(REDEEM_NUM_MULTIPER);
        return { amountOut: percent.mul(d(redeemAmount)).round().toString(), percent: Number(percent.toFixed(2)) };
    }
    async reverseRedeemNum(amount, lock_day) {
        if (BigInt(amount) === BigInt(0)) {
            return '0';
        }
        const lockUpManager = await this.getLockUpManagerEvent();
        if (lockUpManager.max_lock_day === lockUpManager.min_lock_day) {
            return d(amount).mul(REDEEM_NUM_MULTIPER).mul(d(lockUpManager.min_percent_numerator)).div(d(EXCHANGE_RATE_MULTIPER)).toString();
        }
        const mid = d(REDEEM_NUM_MULTIPER)
            .mul(d(lockUpManager.max_lock_day).sub(d(lock_day)))
            .mul(d(lockUpManager.max_percent_numerator).sub(d(lockUpManager.min_percent_numerator)))
            .div(d(lockUpManager.max_lock_day).sub(d(lockUpManager.min_lock_day)));
        const percent = d(REDEEM_NUM_MULTIPER).mul(lockUpManager.max_percent_numerator).sub(mid);
        return d(amount).mul(REDEEM_NUM_MULTIPER).mul(EXCHANGE_RATE_MULTIPER).div(percent).toFixed(0, Decimal.ROUND_UP);
    }
    updateCache(key, data, time = cacheTime5min) {
        let cacheData = this._cache[key];
        if (cacheData) {
            cacheData.overdueTime = getFutureTime(time);
            cacheData.value = data;
        }
        else {
            cacheData = new CachedContent(data, getFutureTime(time));
        }
        this._cache[key] = cacheData;
    }
}
