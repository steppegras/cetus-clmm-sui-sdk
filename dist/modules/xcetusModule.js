/* eslint-disable no-await-in-loop */
/* eslint-disable camelcase */
import { getMoveObjectType, getObjectFields, TransactionBlock } from '@mysten/sui.js';
import Decimal from 'decimal.js';
import { XCetusUtil } from '../utils/xcetus';
import { DividendsRouterModule, EXCHANGE_RATE_MULTIPER, REDEEM_NUM_MULTIPER, XcetusRouterModule, } from '../types/xcetus_type';
import { buildNFT, TransactionUtil, loopToGetAllQueryEvents, getOwnedObjects } from '../utils';
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
export class XCetusModule {
    _sdk;
    _cache = {};
    constructor(sdk) {
        this._sdk = sdk;
    }
    get sdk() {
        return this._sdk;
    }
    async getOwnerVeNFT(accountAddress, forceRefresh = true) {
        const { xcetus } = this.sdk.sdkOptions;
        const cacheKey = `${accountAddress}_getLockUpManagerEvent`;
        const cacheData = this._cache[cacheKey];
        if (!forceRefresh && cacheData !== undefined && cacheData.getCacheData()) {
            return cacheData.value;
        }
        let veNFT;
        const filterType = `${xcetus.xcetus_router}::xcetus::VeNFT`;
        // eslint-disable-next-line no-await-in-loop
        const ownerRes = await getOwnedObjects(this._sdk, accountAddress, {
            options: { showType: true, showContent: true, showDisplay: true },
            filter: { StructType: filterType },
        });
        // eslint-disable-next-line no-loop-func
        ownerRes.data.forEach((item) => {
            const type = extractStructTagFromType(getMoveObjectType(item)).source_address;
            if (type === filterType) {
                if (item.data && item.data.content) {
                    const { fields } = item.data.content;
                    veNFT = {
                        ...buildNFT(item),
                        id: fields.id.id,
                        index: fields.index,
                        type,
                        xcetus_balance: fields.xcetus_balance,
                    };
                    this.updateCache(cacheKey, veNFT, cacheTime24h);
                }
            }
        });
        return veNFT;
    }
    async getOwnerLockCetuss(accountAddress) {
        const { xcetus } = this.sdk.sdkOptions;
        const lockCetuss = [];
        const filterType = `${xcetus.xcetus_router}::lock_coin::LockedCoin<${this.buileCetusCoinType()}>`;
        const ownerRes = await getOwnedObjects(this._sdk, accountAddress, {
            options: { showType: true, showContent: true },
            filter: { StructType: filterType },
        });
        for (const item of ownerRes.data) {
            const type = extractStructTagFromType(getMoveObjectType(item)).source_address;
            if (type === filterType) {
                if (item.data) {
                    const lockCetus = XCetusUtil.buildLockCetus(item.data.content);
                    lockCetus.xcetus_amount = await this.getXCetusAmount(lockCetus.id);
                    lockCetuss.push(lockCetus);
                }
            }
        }
        return lockCetuss;
    }
    async getLockCetus(lock_id) {
        const result = await this._sdk.fullClient.getObject({ id: lock_id, options: { showType: true, showContent: true } });
        if (result.data?.content) {
            const lockCetus = XCetusUtil.buildLockCetus(result.data.content);
            lockCetus.xcetus_amount = await this.getXCetusAmount(lockCetus.id);
            return lockCetus;
        }
        return undefined;
    }
    async getOwnerCetusCoins(accountAddress) {
        const coins = await this._sdk.Resources.getOwnerCoinAssets(accountAddress, this.buileCetusCoinType());
        return coins;
    }
    /**
     * mint venft
     * @returns
     */
    mintVeNFTPayload() {
        const { xcetus } = this.sdk.sdkOptions;
        const tx = new TransactionBlock();
        tx.setGasBudget(this._sdk.gasConfig.GasBudgetLow);
        tx.moveCall({
            target: `${xcetus.xcetus_router}::${XcetusRouterModule}::mint_venft`,
            typeArguments: [],
            arguments: [tx.pure(xcetus.config.xcetus_manager_id)],
        });
        return tx;
    }
    /**
     * Convert Cetus to Xcetus.
     * @param params
     * @returns
     */
    async convertPayload(params) {
        const { xcetus } = this.sdk.sdkOptions;
        const tx = new TransactionBlock();
        const coin_type = this.buileCetusCoinType();
        const primaryCoinInputs = (await TransactionUtil.syncBuildCoinInputForAmount(this._sdk, tx, BigInt(params.amount), coin_type));
        if (params.venft_id === undefined) {
            tx.setGasBudget(this._sdk.gasConfig.GasBudgetHigh);
            tx.moveCall({
                target: `${xcetus.xcetus_router}::${XcetusRouterModule}::mint_and_convert`,
                typeArguments: [],
                arguments: [
                    tx.object(xcetus.config.lock_manager_id),
                    tx.object(xcetus.config.xcetus_manager_id),
                    primaryCoinInputs,
                    tx.pure(params.amount),
                ],
            });
        }
        else {
            tx.setGasBudget(this._sdk.gasConfig.GasBudgetLow);
            tx.moveCall({
                target: `${xcetus.xcetus_router}::${XcetusRouterModule}::convert`,
                typeArguments: [],
                arguments: [
                    tx.object(xcetus.config.lock_manager_id),
                    tx.object(xcetus.config.xcetus_manager_id),
                    primaryCoinInputs,
                    tx.pure(params.amount),
                    tx.pure(params.venft_id),
                ],
            });
        }
        return tx;
    }
    /**
     * Convert Xcetus to Cetus, first step is to lock the Cetus for a period.
     * When the time is reach, cetus can be redeem and xcetus will be burned.
     * @param params
     * @returns
     */
    redeemLockPayload(params) {
        const { xcetus } = this.sdk.sdkOptions;
        const tx = new TransactionBlock();
        tx.setGasBudget(this._sdk.gasConfig.GasBudgetLow);
        tx.moveCall({
            target: `${xcetus.xcetus_router}::${XcetusRouterModule}::redeem_lock`,
            typeArguments: [],
            arguments: [
                tx.pure(xcetus.config.lock_manager_id),
                tx.pure(xcetus.config.xcetus_manager_id),
                tx.pure(params.venft_id),
                tx.pure(params.amount),
                tx.pure(params.lock_day),
                tx.pure(CLOCK_ADDRESS),
            ],
        });
        return tx;
    }
    /**
     * lock time is reach and the cetus can be redeemed, the xcetus will be burned.
     * @param params
     * @returns
     */
    redeemPayload(params) {
        const { xcetus } = this.sdk.sdkOptions;
        const tx = new TransactionBlock();
        tx.setGasBudget(this._sdk.gasConfig.GasBudgetLow);
        tx.moveCall({
            target: `${xcetus.xcetus_router}::${XcetusRouterModule}::redeem`,
            typeArguments: [],
            arguments: [
                tx.pure(xcetus.config.lock_manager_id),
                tx.pure(xcetus.config.xcetus_manager_id),
                tx.pure(params.venft_id),
                tx.pure(params.lock_id),
                tx.pure(CLOCK_ADDRESS),
            ],
        });
        return tx;
    }
    redeemDividendPayload(venft_id, bonus_types) {
        const { xcetus } = this.sdk.sdkOptions;
        const tx = new TransactionBlock();
        tx.setGasBudget(this._sdk.gasConfig.GasBudgetLow);
        bonus_types.forEach((coin) => {
            tx.moveCall({
                target: `${xcetus.dividends_router}::${DividendsRouterModule}::redeem`,
                typeArguments: [coin],
                arguments: [tx.object(xcetus.config.dividend_manager_id), tx.object(venft_id)],
            });
        });
        return tx;
    }
    buileCetusCoinType() {
        return `${this.sdk.sdkOptions.xcetus.cetus_faucet}::cetus::CETUS`;
    }
    /**
     * Cancel the redeem lock, the cetus locked will be return back to the manager and the xcetus will be available again.
     * @param params
     * @returns
     */
    cancelRedeemPayload(params) {
        const { xcetus } = this.sdk.sdkOptions;
        const tx = new TransactionBlock();
        tx.setGasBudget(this._sdk.gasConfig.GasBudgetLow);
        tx.moveCall({
            target: `${xcetus.xcetus_router}::${XcetusRouterModule}::cancel_redeem_lock`,
            typeArguments: [],
            arguments: [
                tx.pure(xcetus.config.lock_manager_id),
                tx.pure(xcetus.config.xcetus_manager_id),
                tx.pure(params.venft_id),
                tx.pure(params.lock_id),
                tx.pure(CLOCK_ADDRESS),
            ],
        });
        return tx;
    }
    async getInitFactoryEvent() {
        const { xcetus_display } = this.sdk.sdkOptions.xcetus;
        const initEventObjects = (await loopToGetAllQueryEvents(this._sdk, { query: { MoveEventType: `${xcetus_display}::xcetus::InitEvent` } }))?.data;
        const initEvent = {
            xcetus_manager_id: '',
        };
        if (initEventObjects.length > 0) {
            initEventObjects.forEach((item) => {
                const fields = item.parsedJson;
                if (fields) {
                    initEvent.xcetus_manager_id = fields.xcetus_manager;
                }
            });
        }
        return initEvent;
    }
    async getLockUpManagerEvent() {
        const { xcetus_display } = this.sdk.sdkOptions.xcetus;
        const cacheKey = `${xcetus_display}_getLockUpManagerEvent`;
        const cacheData = this._cache[cacheKey];
        if (cacheData !== undefined && cacheData.getCacheData()) {
            return cacheData.value;
        }
        const lockEventObjects = (await loopToGetAllQueryEvents(this._sdk, { query: { MoveEventType: `${xcetus_display}::locking::InitializeEvent` } }))?.data;
        const initEvent = {
            lock_manager_id: '',
            max_lock_day: 0,
            max_percent_numerator: 0,
            min_lock_day: 0,
            min_percent_numerator: 0,
            lock_handle_id: '',
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
        initEvent.lock_handle_id = await this.getLockInfoHandle();
        return initEvent;
    }
    async getLockInfoHandle() {
        const { lock_manager_id } = this.sdk.sdkOptions.xcetus.config;
        const cacheKey = `${lock_manager_id}_getLockInfoHandle`;
        const cacheData = this._cache[cacheKey];
        if (cacheData !== undefined && cacheData.getCacheData()) {
            return cacheData.value;
        }
        let lockInfoHandle = '';
        const lockObjects = await this.sdk.fullClient.getObject({ id: lock_manager_id, options: { showContent: true } });
        const fields = getObjectFields(lockObjects);
        if (fields) {
            lockInfoHandle = fields.lock_infos.fields.id.id;
            this.updateCache(cacheKey, lockInfoHandle, cacheTime24h);
        }
        return lockInfoHandle;
    }
    async getDividendManagerEvent() {
        const { dividends_display } = this.sdk.sdkOptions.xcetus;
        const cacheKey = `${dividends_display}_getDividendManagerEvent`;
        const cacheData = this._cache[cacheKey];
        if (cacheData !== undefined && cacheData.getCacheData()) {
            return cacheData.value;
        }
        const lockEventObjects = (await loopToGetAllQueryEvents(this._sdk, { query: { MoveEventType: `${dividends_display}::dividend::InitEvent` } }))?.data;
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
        const { dividend_manager_id } = this.sdk.sdkOptions.xcetus.config;
        const cacheKey = `${dividend_manager_id}_getDividendManager`;
        const cacheData = this._cache[cacheKey];
        if (!forceRefresh && cacheData !== undefined && cacheData.getCacheData()) {
            return cacheData.value;
        }
        const objects = await this._sdk.fullClient.getObject({ id: dividend_manager_id, options: { showContent: true } });
        const fields = getObjectFields(objects);
        const dividendManager = XCetusUtil.buildDividendManager(fields);
        this.updateCache(cacheKey, dividendManager, cacheTime24h);
        return dividendManager;
    }
    async getXcetusManager() {
        const { xcetus } = this.sdk.sdkOptions;
        const result = await this._sdk.fullClient.getObject({ id: xcetus.config.xcetus_manager_id, options: { showContent: true } });
        const fields = getObjectFields(result);
        const xcetusManager = {
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
        return xcetusManager;
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
            const veNFTDividendInfo = XCetusUtil.buildVeNFTDividendInfo(fields);
            return veNFTDividendInfo;
        }
        catch (error) {
            return undefined;
        }
    }
    async redeemNum(redeemAmount, lock_day) {
        if (BigInt(redeemAmount) === BigInt(0)) {
            return { amountOut: '0', percent: '0' };
        }
        const lockUpManager = await this.getLockUpManagerEvent();
        console.log('lockUpManager', lockUpManager);
        const mid = d(REDEEM_NUM_MULTIPER)
            .mul(d(lockUpManager.max_lock_day).sub(d(lock_day)))
            .mul(d(lockUpManager.max_percent_numerator).sub(d(lockUpManager.min_percent_numerator)))
            .div(d(lockUpManager.max_lock_day).sub(d(lockUpManager.min_lock_day)));
        const percent = d(REDEEM_NUM_MULTIPER)
            .mul(d(lockUpManager.max_percent_numerator))
            .sub(mid)
            .div(d(EXCHANGE_RATE_MULTIPER))
            .div(REDEEM_NUM_MULTIPER);
        return { amountOut: d(percent).mul(d(redeemAmount)).round().toString(), percent: percent.toString() };
    }
    async reverseRedeemNum(amount, lock_day) {
        if (BigInt(amount) === BigInt(0)) {
            return { amountOut: '0', percent: '0' };
        }
        const lockUpManager = await this.getLockUpManagerEvent();
        const mid = d(REDEEM_NUM_MULTIPER)
            .mul(d(lockUpManager.max_lock_day).sub(d(lock_day)))
            .mul(d(lockUpManager.max_percent_numerator).sub(d(lockUpManager.min_percent_numerator)))
            .div(d(lockUpManager.max_lock_day).sub(d(lockUpManager.min_lock_day)));
        const percent = d(REDEEM_NUM_MULTIPER)
            .mul(d(lockUpManager.max_percent_numerator))
            .sub(mid)
            .div(d(EXCHANGE_RATE_MULTIPER))
            .div(REDEEM_NUM_MULTIPER);
        return { amountOut: d(amount).div(percent).toFixed(0, Decimal.ROUND_UP), percent: percent.toString() };
    }
    async getXCetusAmount(lock_id) {
        const { lock_handle_id } = this._sdk.sdkOptions.xcetus.config;
        const cacheKey = `${lock_id}_getXCetusAmount`;
        const cacheData = this._cache[cacheKey];
        if (cacheData !== undefined && cacheData.getCacheData()) {
            return cacheData.value;
        }
        try {
            const response = await this.sdk.fullClient.getDynamicFieldObject({
                parentId: lock_handle_id,
                name: {
                    type: '0x2::object::ID',
                    value: lock_id,
                },
            });
            const fields = getObjectFields(response);
            if (fields) {
                const { xcetus_amount } = fields.value.fields.value.fields;
                this.updateCache(cacheKey, xcetus_amount, cacheTime24h);
                return xcetus_amount;
            }
        }
        catch (error) {
            //
        }
        return '0';
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
