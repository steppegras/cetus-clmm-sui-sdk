/* eslint-disable no-constant-condition */
import { Coin, getMoveObject, getObjectFields, getObjectPreviousTransactionDigest, } from '@mysten/sui.js';
import { CachedContent } from '../utils/cachedContent';
import { buildPool, buildPosition, buildPositionReward, multiGetObjects } from '../utils/common';
import { extractStructTagFromType } from '../utils/contracts';
import { addHexPrefix } from '../utils/hex';
import { CoinAssist } from '../math/CoinAssist';
import { loopToGetAllQueryEvents } from '../utils';
export const cacheTime5min = 5 * 60 * 1000;
export const cacheTime24h = 24 * 60 * 60 * 1000;
export const intervalFaucetTime = 12 * 60 * 60 * 1000;
export var PositionStatus;
(function (PositionStatus) {
    PositionStatus["Deleted"] = "Deleted";
    PositionStatus["Exists"] = "Exists";
    PositionStatus["NotExists"] = "NotExists";
})(PositionStatus || (PositionStatus = {}));
function getFutureTime(interval) {
    return Date.parse(new Date().toString()) + interval;
}
export class ResourcesModule {
    constructor(sdk) {
        this._cache = {};
        this._sdk = sdk;
    }
    get sdk() {
        return this._sdk;
    }
    async getSuiTransactionResponse(digest, forceRefresh = false) {
        const cacheKey = `${digest}_getSuiTransactionResponse`;
        const cacheData = this._cache[cacheKey];
        if (cacheData !== undefined && cacheData.getCacheData() && !forceRefresh) {
            return cacheData.value;
        }
        let objects;
        try {
            objects = (await this._sdk.fullClient.getTransactionBlock({
                digest,
                options: {
                    showEvents: true,
                    showEffects: true,
                    showBalanceChanges: true,
                    showInput: true,
                    showObjectChanges: true,
                },
            }));
        }
        catch (error) {
            objects = (await this._sdk.fullClient.getTransactionBlock({
                digest,
                options: {
                    showEvents: true,
                    showEffects: true,
                },
            }));
        }
        this.updateCache(cacheKey, objects, cacheTime24h);
        return objects;
    }
    async getFaucetEvent(packageObjectId, walletAddress, forceRefresh = true) {
        const cacheKey = `${packageObjectId}_${walletAddress}_getFaucetEvent`;
        const cacheData = this._cache[cacheKey];
        if (cacheData !== undefined && cacheData.getCacheData() && !forceRefresh) {
            return cacheData.value;
        }
        const objects = (await loopToGetAllQueryEvents(this._sdk, {
            query: { MoveEventType: `${packageObjectId}::faucet::FaucetEvent` },
        }))?.data;
        let findFaucetEvent = {
            id: '',
            time: 0,
        };
        objects.forEach((eventObject) => {
            if (addHexPrefix(walletAddress) === eventObject.sender) {
                const fields = eventObject.parsedJson;
                if (fields) {
                    const faucetEvent = {
                        id: fields.id,
                        time: Number(fields.time),
                    };
                    const findTime = findFaucetEvent.time;
                    if (findTime > 0) {
                        if (faucetEvent.time > findTime) {
                            findFaucetEvent = faucetEvent;
                        }
                    }
                    else {
                        findFaucetEvent = faucetEvent;
                    }
                }
            }
        });
        if (findFaucetEvent.time > 0) {
            this.updateCache(cacheKey, findFaucetEvent, cacheTime24h);
            return findFaucetEvent;
        }
        return null;
    }
    async getInitEvent(forceRefresh = false) {
        const packageObjectId = this._sdk.sdkOptions.clmm.clmm_display;
        const cacheKey = `${packageObjectId}_getInitEvent`;
        const cacheData = this._cache[cacheKey];
        if (cacheData !== undefined && cacheData.getCacheData() && !forceRefresh) {
            return cacheData.value;
        }
        const packageObject = await this._sdk.fullClient.getObject({
            id: packageObjectId,
            options: { showPreviousTransaction: true },
        });
        const previousTx = getObjectPreviousTransactionDigest(packageObject);
        const objects = (await loopToGetAllQueryEvents(this._sdk, {
            query: { Transaction: previousTx },
        }))?.data;
        // console.log('objects: ', objects)
        const initEvent = {
            pools_id: '',
            global_config_id: '',
            global_vault_id: '',
        };
        if (objects.length > 0) {
            objects.forEach((item) => {
                const fields = item.parsedJson;
                if (item.type) {
                    switch (extractStructTagFromType(item.type).full_address) {
                        case `${packageObjectId}::config::InitConfigEvent`:
                            initEvent.global_config_id = fields.global_config_id;
                            break;
                        case `${packageObjectId}::factory::InitFactoryEvent`:
                            initEvent.pools_id = fields.pools_id;
                            break;
                        case `${packageObjectId}::rewarder::RewarderInitEvent`:
                            initEvent.global_vault_id = fields.global_vault_id;
                            break;
                        default:
                            break;
                    }
                }
            });
            this.updateCache(cacheKey, initEvent, cacheTime24h);
            return initEvent;
        }
        return initEvent;
    }
    async getCreatePartnerEvent(forceRefresh = false) {
        const packageObjectId = this._sdk.sdkOptions.clmm.clmm_display;
        const cacheKey = `${packageObjectId}_getInitEvent`;
        const cacheData = this._cache[cacheKey];
        if (cacheData !== undefined && cacheData.getCacheData() && !forceRefresh) {
            return cacheData.value;
        }
        const objects = (await loopToGetAllQueryEvents(this._sdk, {
            query: { MoveEventType: `${packageObjectId}::partner::CreatePartnerEvent` },
        }))?.data;
        const events = [];
        if (objects.length > 0) {
            objects.forEach((item) => {
                events.push(item.parsedJson);
            });
            this.updateCache(cacheKey, events, cacheTime24h);
        }
        return events;
    }
    async getPoolImmutables(assignPools = [], offset = 0, limit = 100, forceRefresh = false) {
        const clmmIntegrate = this._sdk.sdkOptions.clmm.clmm_display;
        const cacheKey = `${clmmIntegrate}_getInitPoolEvent`;
        const cacheData = this._cache[cacheKey];
        const allPools = [];
        const filterPools = [];
        if (cacheData !== undefined && cacheData.getCacheData() && !forceRefresh) {
            allPools.push(...cacheData.value);
        }
        if (allPools.length === 0) {
            try {
                const objects = await loopToGetAllQueryEvents(this._sdk, {
                    query: { MoveEventType: `${clmmIntegrate}::factory::CreatePoolEvent` },
                });
                // console.log('objects: ', objects)
                objects.data.forEach((object) => {
                    const fields = object.parsedJson;
                    if (fields) {
                        allPools.push({
                            poolAddress: fields.pool_id,
                            tickSpacing: fields.tick_spacing,
                            coinTypeA: extractStructTagFromType(fields.coin_type_a).full_address,
                            coinTypeB: extractStructTagFromType(fields.coin_type_b).full_address,
                        });
                    }
                });
                this.updateCache(cacheKey, allPools, cacheTime24h);
            }
            catch (error) {
                console.log('getPoolImmutables', error);
            }
        }
        const hasassignPools = assignPools.length > 0;
        for (let index = 0; index < allPools.length; index += 1) {
            const item = allPools[index];
            if (hasassignPools && !assignPools.includes(item.poolAddress)) {
                continue;
            }
            if (!hasassignPools) {
                const itemIndex = index;
                if (itemIndex < offset || itemIndex >= offset + limit) {
                    continue;
                }
            }
            filterPools.push(item);
        }
        return filterPools;
    }
    async getPools(assignPools = [], offset = 0, limit = 100) {
        // console.log(assignPools)
        const allPool = [];
        let poolObjectIds = [];
        if (assignPools.length > 0) {
            poolObjectIds = [...assignPools];
        }
        else {
            const poolImmutables = await this.getPoolImmutables([], offset, limit, false);
            poolImmutables.forEach((item) => {
                poolObjectIds.push(item.poolAddress);
            });
        }
        const objectDataResponses = await multiGetObjects(this._sdk, poolObjectIds, {
            showContent: true,
            showType: true,
        });
        for (const suiObj of objectDataResponses) {
            const pool = buildPool(suiObj);
            allPool.push(pool);
            const cacheKey = `${pool.poolAddress}_getPoolObject`;
            this.updateCache(cacheKey, pool, cacheTime24h);
        }
        return allPool;
    }
    async getPool(poolObjectId, forceRefresh = true) {
        const cacheKey = `${poolObjectId}_getPoolObject`;
        const cacheData = this._cache[cacheKey];
        if (cacheData !== undefined && cacheData.getCacheData() && !forceRefresh) {
            return cacheData.value;
        }
        const objects = (await this._sdk.fullClient.getObject({
            id: poolObjectId,
            options: {
                showType: true,
                showContent: true,
            },
        }));
        const pool = buildPool(objects);
        this.updateCache(cacheKey, pool);
        return pool;
    }
    buildPositionType() {
        const cetusClmm = this._sdk.sdkOptions.clmm.clmm_display;
        return `${cetusClmm}::position::Position`;
    }
    async getPositionList(accountAddress, assignPoolIds = []) {
        const allPosition = [];
        let cursor = null;
        while (true) {
            // eslint-disable-next-line no-await-in-loop
            const ownerRes = await this._sdk.fullClient.getOwnedObjects({
                owner: accountAddress,
                options: { showType: true, showContent: true, showDisplay: true, showOwner: true },
                cursor,
                // filter: { Package: cetusClmm },
            });
            const hasAssignPoolIds = assignPoolIds.length > 0;
            for (const item of ownerRes.data) {
                const type = extractStructTagFromType(item.data.type);
                if (type.full_address === this.buildPositionType()) {
                    const position = buildPosition(item);
                    const cacheKey = `${position.pos_object_id}_getPositionList`;
                    this.updateCache(cacheKey, position, cacheTime24h);
                    if (hasAssignPoolIds) {
                        if (assignPoolIds.includes(position.pool)) {
                            allPosition.push(position);
                        }
                    }
                    else {
                        allPosition.push(position);
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
        return allPosition;
    }
    async getPosition(positionHandle, positionId) {
        let position = await this.getSipmlePosition(positionId);
        position = await this.updatePositionRewarders(positionHandle, position);
        return position;
    }
    async getPositionById(positionId) {
        const position = await this.getSipmlePosition(positionId);
        console.log('position: ', position);
        const pool = await this.getPool(position.pool, false);
        const result = await this.updatePositionRewarders(pool.positions_handle, position);
        return result;
    }
    async getSipmlePosition(positionId) {
        const cacheKey = `${positionId}_getPositionList`;
        let position = this.getSipmlePositionByCache(positionId);
        if (position === undefined) {
            const objectDataResponses = await this.sdk.fullClient.getObject({
                id: positionId,
                options: { showContent: true, showType: true, showDisplay: true, showOwner: true },
            });
            position = buildPosition(objectDataResponses);
            this.updateCache(cacheKey, position, cacheTime24h);
        }
        return position;
    }
    getSipmlePositionByCache(positionId) {
        const cacheKey = `${positionId}_getPositionList`;
        const cacheData = this._cache[cacheKey];
        if (cacheData !== undefined && cacheData.getCacheData()) {
            return cacheData.value;
        }
        return undefined;
    }
    async getSipmlePositionList(positionIds) {
        const positionList = [];
        const notFoundIds = [];
        positionIds.forEach((id) => {
            const position = this.getSipmlePositionByCache(id);
            if (position) {
                positionList.push(position);
            }
            else {
                notFoundIds.push(id);
            }
        });
        if (notFoundIds.length > 0) {
            const objectDataResponses = await multiGetObjects(this._sdk, notFoundIds, {
                showOwner: true,
                showContent: true,
                showDisplay: true,
                showType: true,
            });
            objectDataResponses.forEach((info) => {
                const position = buildPosition(info);
                positionList.push(position);
                const cacheKey = `${position.pos_object_id}_getPositionList`;
                this.updateCache(cacheKey, position, cacheTime24h);
            });
        }
        return positionList;
    }
    async updatePositionRewarders(positionHandle, position) {
        // const res = await sdk.fullClient.getDynamicFields({parentId: "0x70aca04c93afb16bbe8e7cf132aaa40186e4b3e8197aa239619f662e3eb46a3a"})
        const res = await this._sdk.fullClient.getDynamicFieldObject({
            parentId: positionHandle,
            name: {
                type: '0x2::object::ID',
                value: position.pos_object_id,
            },
        });
        const { fields } = getObjectFields(res.data).value.fields.value;
        const positionReward = buildPositionReward(fields);
        return {
            ...position,
            ...positionReward,
        };
    }
    async getOwnerCoinAssets(suiAddress, coinType) {
        const allCoinAsset = [];
        let nextCursor = null;
        while (true) {
            // eslint-disable-next-line no-await-in-loop
            const allCoinObject = await (coinType
                ? this._sdk.fullClient.getCoins({
                    owner: suiAddress,
                    coinType,
                    cursor: nextCursor,
                })
                : this._sdk.fullClient.getAllCoins({
                    owner: suiAddress,
                    cursor: nextCursor,
                }));
            // eslint-disable-next-line no-loop-func
            allCoinObject.data.forEach((coin) => {
                if (BigInt(coin.balance) > 0) {
                    allCoinAsset.push({
                        coinAddress: extractStructTagFromType(coin.coinType).source_address,
                        coinObjectId: coin.coinObjectId,
                        balance: BigInt(coin.balance),
                    });
                }
            });
            nextCursor = allCoinObject.nextCursor;
            if (!allCoinObject.hasNextPage) {
                break;
            }
        }
        return allCoinAsset;
    }
    async getSuiObjectOwnedByAddress(suiAddress) {
        const allSuiObjects = [];
        const allObjectRefs = await this._sdk.fullClient.getOwnedObjects({
            owner: suiAddress,
        });
        const objectIDs = allObjectRefs.data.map((anObj) => anObj.objectId);
        const allObjRes = await this._sdk.fullClient.multiGetObjects({
            ids: objectIDs,
        });
        allObjRes.forEach((objRes) => {
            const moveObject = getMoveObject(objRes);
            if (moveObject) {
                const coinAddress = CoinAssist.getCoinTypeArg(moveObject);
                const balance = Coin.getBalance(moveObject);
                const coinAsset = {
                    coinAddress,
                    balance,
                    ...moveObject,
                };
                allSuiObjects.push(coinAsset);
            }
        });
        return allSuiObjects;
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
function item(item) {
    throw new Error('Function not implemented.');
}
