/* eslint-disable guard-for-in */
/* eslint-disable class-methods-use-this */
/* eslint-disable no-await-in-loop */
/* eslint-disable camelcase */
import { getObjectFields, TransactionBlock } from '@mysten/sui.js';
import Decimal from 'decimal.js';
import { d, loopToGetAllQueryEvents, multiGetObjects } from '../utils';
import { MakerUtil } from '../utils/maker';
import { MakerRouterModule, } from '../types/maker_type';
import { CachedContent } from '../utils/cachedContent';
import { PositionStatus } from './resourcesModule';
export const cacheTime5min = 5 * 60 * 1000;
export const cacheTime24h = 24 * 60 * 60 * 1000;
export const intervalFaucetTime = 12 * 60 * 60 * 1000;
function getFutureTime(interval) {
    return Date.parse(new Date().toString()) + interval;
}
export class MakerModule {
    constructor(sdk) {
        this._cache = {};
        this._sdk = sdk;
    }
    get sdk() {
        return this._sdk;
    }
    async getPoolImmutables(forceRefresh = false) {
        const { maker_bonus } = this._sdk.sdkOptions;
        const cacheKey = `${maker_bonus.maker_display}_getPoolImmutables`;
        const cacheData = this._cache[cacheKey];
        const allPool = [];
        if (cacheData !== undefined && cacheData.getCacheData() && !forceRefresh) {
            allPool.push(...cacheData.value);
        }
        else {
            const simplePoolIds = [];
            const result = await this._sdk.fullClient.getDynamicFields({ parentId: maker_bonus.config.maker_pool_handle });
            result.data?.forEach((item) => {
                simplePoolIds.push(item.objectId);
            });
            const simpleDatas = await multiGetObjects(this._sdk, simplePoolIds, { showContent: true });
            for (const item of simpleDatas) {
                const fields = getObjectFields(item);
                if (fields) {
                    allPool.push(MakerUtil.buildPoolImmutables(fields));
                }
            }
        }
        return allPool;
    }
    async getPoolImmutable(poolObjectId) {
        const { maker_bonus } = this._sdk.sdkOptions;
        const cacheKey = `${maker_bonus.maker_display}_getPoolImmutables`;
        const cacheData = this._cache[cacheKey];
        if (cacheData !== undefined && cacheData.getCacheData()) {
            const poolImmutableool = cacheData.value.filter((item) => {
                return poolObjectId === item.pool_id;
            });
            if (poolImmutableool.length > 0) {
                return poolImmutableool[0];
            }
        }
        const result = await this._sdk.fullClient.getDynamicFieldObject({
            parentId: maker_bonus.config.maker_pool_handle,
            name: {
                type: '0x2::object::ID',
                value: poolObjectId,
            },
        });
        const fields = getObjectFields(result);
        return MakerUtil.buildPoolImmutables(fields);
    }
    async getPools() {
        const allPool = [];
        const poolImmutables = await this.getPoolImmutables();
        const poolObjectIds = poolImmutables.map((item) => {
            return item.pool_id;
        });
        const objectDataResponses = await multiGetObjects(this._sdk, poolObjectIds, { showType: true, showContent: true });
        let index = 0;
        for (const suiObj of objectDataResponses) {
            const poolState = MakerUtil.buildPoolState(suiObj);
            if (poolState) {
                const pool = {
                    ...poolImmutables[index],
                    ...poolState,
                };
                allPool.push(pool);
                const cacheKey = `${pool.pool_id}_getPoolObject`;
                this.updateCache(cacheKey, pool, cacheTime24h);
            }
            index += 1;
        }
        return allPool;
    }
    async getPool(poolObjectId, forceRefresh = true) {
        const cacheKey = `${poolObjectId}_getPoolObject`;
        const cacheData = this._cache[cacheKey];
        const poolImmutables = await this.getPoolImmutable(poolObjectId);
        if (cacheData !== undefined && cacheData.getCacheData() && !forceRefresh) {
            return cacheData.value;
        }
        const objects = await this._sdk.fullClient.getObject({
            id: poolObjectId,
            options: { showContent: true, showType: true },
        });
        const poolState = MakerUtil.buildPoolState(objects);
        const pool = {
            ...poolImmutables,
            ...poolState,
        };
        this.updateCache(cacheKey, pool, cacheTime24h);
        return pool;
    }
    async getPoolHandleId(booster_config_id) {
        const reault = await this._sdk.fullClient.getObject({ id: booster_config_id, options: { showContent: true } });
        const fields = getObjectFields(reault);
        if (fields) {
            return fields.list.fields.id.id;
        }
        return '';
    }
    async getMakerPoolPeriods(pool, forceRefresh = false) {
        const periods = [];
        const cacheKey = `${pool.pool_id}_getMakerPoolPeriods`;
        const cacheData = this._cache[cacheKey];
        if (cacheData !== undefined && cacheData.getCacheData() && !forceRefresh) {
            return cacheData.value;
        }
        const results = await this._sdk.fullClient.getDynamicFields({ parentId: pool.whale_nfts.whale_nfts_handle });
        results.data.forEach((item) => {
            const info = {
                id: item.objectId,
                start_time: 0,
                end_time: 0,
                period: Number(item.name.value),
            };
            info.start_time = Number(d(pool.start_time)
                .add(d(pool.interval_day)
                .mul(24 * 3600)
                .mul(info.period))
                .toFixed(0, Decimal.ROUND_DOWN));
            info.end_time = Number(d(info.start_time)
                .add(d(pool.interval_day).mul(24 * 3600))
                .toFixed(0, Decimal.ROUND_DOWN));
            periods.push(info);
        });
        this.updateCache(cacheKey, periods, cacheTime24h);
        return periods;
    }
    async getInitFactoryEvent() {
        const { maker_display } = this.sdk.sdkOptions.maker_bonus;
        const initEventObjects = (await loopToGetAllQueryEvents(this._sdk, { query: { MoveEventType: `${maker_display}::config::InitEvent` } }))
            ?.data;
        const initEvent = {
            maker_config_id: '',
            maker_pool_handle: '',
        };
        if (initEventObjects.length > 0) {
            initEventObjects.forEach((item) => {
                const fields = item.parsedJson;
                if (fields) {
                    initEvent.maker_config_id = fields.config_id;
                }
            });
        }
        initEvent.maker_pool_handle = await this.getPoolHandleId(initEvent.maker_config_id);
        return initEvent;
    }
    async getPoolMarkerPositionList(whale_nfts_handle, makerPoolPeriods, forceRefresh = false) {
        const recordMarkerPosition = {};
        const notFindMakerPoolPeriods = [];
        if (!forceRefresh) {
            makerPoolPeriods.forEach((item) => {
                const cacheKey = `${whale_nfts_handle}_${item.period}_getPoolMarkerPositionList`;
                const cacheData = this._cache[cacheKey];
                if (cacheData !== undefined && cacheData.getCacheData() && !forceRefresh) {
                    recordMarkerPosition[item.period] = cacheData.value;
                }
                else {
                    recordMarkerPosition[item.period] = [];
                    notFindMakerPoolPeriods.push(item);
                }
            });
        }
        try {
            if (notFindMakerPoolPeriods.length > 0) {
                const results = await multiGetObjects(this._sdk, notFindMakerPoolPeriods.map((item) => item.id), { showContent: true });
                results.forEach((item) => {
                    const fields = getObjectFields(item);
                    const bonusInfoList = MakerUtil.buildMarkerPositions(fields);
                    if (bonusInfoList.length > 0) {
                        const { period_id } = bonusInfoList[0];
                        const findPeriod = makerPoolPeriods.filter((item) => item.id === period_id)[0];
                        recordMarkerPosition[findPeriod.period] = bonusInfoList;
                    }
                });
            }
            const allList = [];
            for (const key in recordMarkerPosition) {
                const markerPosition = recordMarkerPosition[key];
                markerPosition.forEach((position) => {
                    allList.push(position);
                });
            }
            if (allList.length > 0) {
                const positionList = await this._sdk.Resources.getSipmlePositionList(allList.map((item) => {
                    return item.id;
                }));
                for (const bonusInfo of allList) {
                    for (const position of positionList) {
                        if (bonusInfo.id === position.pos_object_id) {
                            bonusInfo.clmm_position = position;
                            break;
                        }
                    }
                }
            }
        }
        catch (error) {
            console.log(error);
        }
        for (const key in recordMarkerPosition) {
            const cacheKey = `${whale_nfts_handle}_${key}_getPoolMarkerPositionList`;
            this.updateCache(cacheKey, recordMarkerPosition[key], cacheTime24h);
        }
        return recordMarkerPosition;
    }
    async updateXCetusRewarderAndFee(pool, positionList, makerPoolPeriod) {
        const total_points_after_multiper = await this.calculateTotalPointsAfterMultiper(pool, makerPoolPeriod);
        for (const position of positionList) {
            await this.calculateXCetusRewarder(pool, position, makerPoolPeriod.period, total_points_after_multiper);
        }
        return positionList;
    }
    async calculateXCetusRewarder(pool, position, period, total_points_after_multiper) {
        const rewarder_info = await this.getPoolBonusInfo(pool.rewarders.rewarder_handle, period);
        const { fee_share_rate } = this.calculateFeeShareRate(pool, position, total_points_after_multiper);
        const bonus_num = d(fee_share_rate).mul(rewarder_info.total_bonus);
        if (position.is_redeemed) {
            position.bonus_num = '0';
        }
        else {
            position.bonus_num = bonus_num.toString();
        }
        return position.bonus_num;
    }
    calculateFeeShareRate(pool, position, total_points_after_multiper) {
        const bonus_percent = MakerUtil.getBonusPercent(pool.config, position.percent);
        const points_after_multiper = d(position.point).mul(bonus_percent);
        const fee_share_rate = d(points_after_multiper).div(total_points_after_multiper);
        position.point_after_multiplier = points_after_multiper.toString();
        position.fee_share_rate = Number(fee_share_rate);
        return { fee_share_rate: Number(fee_share_rate), points_after_multiper: points_after_multiper.toString() };
    }
    async calculateTotalPointsAfterMultiper(pool, makerPoolPeriod) {
        const positionListMap = await this.getPoolMarkerPositionList(pool.whale_nfts.whale_nfts_handle, [makerPoolPeriod]);
        let total_points_after_multiper = d(0);
        const positionList = positionListMap[makerPoolPeriod.period];
        for (const position of positionList) {
            const bonus_percent = MakerUtil.getBonusPercent(pool.config, position.percent);
            const points_after_multiper = d(position.point).mul(bonus_percent);
            total_points_after_multiper = total_points_after_multiper.add(points_after_multiper);
        }
        return total_points_after_multiper.toString();
    }
    async calculateAllXCetusRewarder(pools) {
        const ownerAddress = this._sdk.senderAddress;
        let claimtotal = d(0);
        // key: pool_id value: nft_ids
        const claimRecord = [];
        for (const pool of pools) {
            const makerPoolPeriods = await this._sdk.MakerModule.getMakerPoolPeriods(pool);
            const positionList = await this._sdk.MakerModule.getPoolMarkerPositionList(pool.whale_nfts.whale_nfts_handle, makerPoolPeriods);
            const owner_position_ids = [];
            for (const makerPoolPeriod of makerPoolPeriods) {
                const ownerList = positionList[makerPoolPeriod.period].filter((item) => {
                    if (ownerAddress.length === 0) {
                        return false;
                    }
                    return item.clmm_position?.owner === ownerAddress;
                });
                if (ownerList.length > 0) {
                    await this._sdk.MakerModule.updateXCetusRewarderAndFee(pool, ownerList, makerPoolPeriod);
                    // eslint-disable-next-line no-loop-func
                    ownerList.forEach((item) => {
                        if (item.clmm_position?.position_status === PositionStatus.Exists && d(item.bonus_num).greaterThan(0)) {
                            claimtotal = claimtotal.add(item.bonus_num);
                            if (!owner_position_ids.includes(item.clmm_position.pos_object_id)) {
                                owner_position_ids.push(item.clmm_position.pos_object_id);
                            }
                        }
                    });
                }
            }
            claimRecord.push({
                bonus_type: pool.bonus_type,
                pool_id: pool.pool_id,
                nft_ids: owner_position_ids,
            });
        }
        return {
            claimtotal,
            claimRecord,
        };
    }
    async getPoolBonusInfo(rewarder_handle, period, forceRefresh = false) {
        const cacheKey = `${rewarder_handle}_${period}_getPoolBonusInfo`;
        const cacheData = this._cache[cacheKey];
        if (cacheData !== undefined && cacheData.getCacheData() && !forceRefresh) {
            return cacheData.value;
        }
        const results = await this.sdk.fullClient.getDynamicFieldObject({
            parentId: rewarder_handle,
            name: {
                type: 'u64',
                value: period.toString(),
            },
        });
        const fields = getObjectFields(results);
        const bonusInfo = MakerUtil.buildPoolBonusInfo(fields);
        this.updateCache(cacheKey, bonusInfo, cacheTime5min);
        return bonusInfo;
    }
    /**
     * Claim the bonus
     * @param params
     * @returns
     */
    claimPayload(params) {
        const { maker_bonus, xcetus } = this.sdk.sdkOptions;
        const tx = new TransactionBlock();
        tx.setGasBudget(this._sdk.gasConfig.GasBudgetMiddle);
        tx.moveCall({
            target: `${maker_bonus.maker_router}::${MakerRouterModule}::claim`,
            typeArguments: [params.bonus_type],
            arguments: [
                tx.pure(maker_bonus.config.maker_config_id),
                tx.pure(params.market_pool_id),
                tx.pure(params.position_nft_id),
                tx.pure(params.phase),
                tx.pure(xcetus.config.lock_manager_id),
                tx.pure(xcetus.config.xcetus_manager_id),
                tx.pure(params.ve_nft_id),
            ],
        });
        return tx;
    }
    claimAllPayload(params) {
        const { maker_bonus, xcetus } = this.sdk.sdkOptions;
        const tx = new TransactionBlock();
        tx.setGasBudget(this._sdk.gasConfig.GasBudgetHigh3);
        params.whale_nfts.forEach((item) => {
            item.nft_ids.forEach((nft_id) => {
                tx.moveCall({
                    target: `${maker_bonus.maker_router}::${MakerRouterModule}::claim_all`,
                    typeArguments: [item.bonus_type],
                    arguments: [
                        tx.object(maker_bonus.config.maker_config_id),
                        tx.object(item.pool_id),
                        tx.object(nft_id),
                        tx.object(xcetus.config.lock_manager_id),
                        tx.object(xcetus.config.xcetus_manager_id),
                        tx.object(params.ve_nft_id),
                    ],
                });
            });
        });
        return tx;
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
