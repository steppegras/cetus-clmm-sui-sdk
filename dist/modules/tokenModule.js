/* eslint-disable class-methods-use-this */
import { Base64 } from 'js-base64';
import { getObjectPreviousTransactionDigest, TransactionBlock } from '@mysten/sui.js';
import { CachedContent } from '../utils/cachedContent';
import { extractStructTagFromType } from '../utils/contracts';
import { loopToGetAllQueryEvents } from '../utils';
export const cacheTime5min = 5 * 60 * 1000;
export const cacheTime24h = 24 * 60 * 60 * 1000;
function getFutureTime(interval) {
    return Date.parse(new Date().toString()) + interval;
}
export class TokenModule {
    _sdk;
    _cache = {};
    constructor(sdk) {
        this._sdk = sdk;
    }
    get sdk() {
        return this._sdk;
    }
    async getAllRegisteredTokenList(forceRefresh = false) {
        const list = await this.factchTokenList('', forceRefresh);
        return list;
    }
    async getOwnerTokenList(listOwnerAddr = '', forceRefresh = false) {
        const list = await this.factchTokenList(listOwnerAddr, forceRefresh);
        return list;
    }
    async getAllRegisteredPoolList(forceRefresh = false) {
        const list = await this.factchPoolList('', forceRefresh);
        return list;
    }
    async getOwnerPoolList(listOwnerAddr = '', forceRefresh = false) {
        const list = await this.factchPoolList(listOwnerAddr, forceRefresh);
        return list;
    }
    async getWarpPoolList(forceRefresh = false) {
        const list = await this.factchWarpPoolList('', '', forceRefresh);
        return list;
    }
    async getOwnerWarpPoolList(poolOwnerAddr = '', coinOwnerAddr = '', forceRefresh = false) {
        const list = await this.factchWarpPoolList(poolOwnerAddr, coinOwnerAddr, forceRefresh);
        return list;
    }
    async getTokenListByCoinTypes(coinTypes) {
        const tokenMap = {};
        const cacheKey = `getAllRegisteredTokenList`;
        const cacheData = this.getCacheData(cacheKey);
        if (cacheData !== null) {
            const tokenList = cacheData;
            for (const coinType of coinTypes) {
                for (const token of tokenList) {
                    if (coinType === token.address) {
                        tokenMap[coinType] = token;
                        continue;
                    }
                }
            }
        }
        const unFindArray = coinTypes.filter((coinType) => {
            return tokenMap[coinType] === undefined;
        });
        for (const coinType of unFindArray) {
            const metadataKey = `${coinType}_metadata`;
            const metadata = this.getCacheData(metadataKey);
            if (metadata !== null) {
                tokenMap[coinType] = metadata;
            }
            else {
                // eslint-disable-next-line no-await-in-loop
                const data = await this._sdk.fullClient.getCoinMetadata({
                    coinType,
                });
                if (data) {
                    const token = {
                        id: data.id,
                        name: data.name,
                        symbol: data.symbol,
                        official_symbol: data.symbol,
                        coingecko_id: '',
                        decimals: data.decimals,
                        project_url: '',
                        logo_url: data.iconUrl,
                        address: coinType,
                    };
                    tokenMap[coinType] = token;
                    this.updateCache(metadataKey, token, cacheTime24h);
                }
            }
        }
        return tokenMap;
    }
    async factchTokenList(listOwnerAddr = '', forceRefresh = false) {
        const { simulationAccount, token } = this.sdk.sdkOptions;
        const cacheKey = `getAllRegisteredTokenList`;
        if (!forceRefresh) {
            const cacheData = this.getCacheData(cacheKey);
            if (cacheData !== null) {
                return cacheData;
            }
        }
        const isOwnerRequest = listOwnerAddr.length > 0;
        const tx = new TransactionBlock();
        tx.moveCall({
            target: `${token.token_display}::coin_list::${isOwnerRequest ? 'fetch_full_list' : 'fetch_all_registered_coin_info'}`,
            arguments: isOwnerRequest
                ? [tx.pure(token.config.coin_registry_id), tx.pure(listOwnerAddr)]
                : [tx.pure(token.config.coin_registry_id)],
        });
        const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
            transactionBlock: tx,
            sender: simulationAccount.address,
        });
        const tokenList = [];
        simulateRes.events?.forEach((item) => {
            const formatType = extractStructTagFromType(item.type);
            if (formatType.full_address === `${token.token_display}::coin_list::FetchCoinListEvent`) {
                item.parsedJson.full_list.value_list.forEach((item) => {
                    tokenList.push(this.transformData(item, false));
                });
            }
        });
        this.updateCache(cacheKey, tokenList, cacheTime24h);
        return tokenList;
    }
    async factchPoolList(listOwnerAddr = '', forceRefresh = false) {
        const { simulationAccount, token } = this.sdk.sdkOptions;
        const cacheKey = `getAllRegisteredPoolList`;
        if (!forceRefresh) {
            const cacheData = this.getCacheData(cacheKey);
            if (cacheData !== null) {
                return cacheData;
            }
        }
        const isOwnerRequest = listOwnerAddr.length > 0;
        const typeArguments = [];
        const args = isOwnerRequest ? [token.config.pool_registry_id, listOwnerAddr] : [token.config.pool_registry_id];
        const payload = {
            packageObjectId: token.token_display,
            module: 'lp_list',
            function: isOwnerRequest ? 'fetch_full_list' : 'fetch_all_registered_coin_info',
            gasBudget: 10000,
            typeArguments,
            arguments: args,
        };
        console.log('payload: ', payload);
        const tx = new TransactionBlock();
        tx.moveCall({
            target: `${token.token_display}::lp_list::${isOwnerRequest ? 'fetch_full_list' : 'fetch_all_registered_coin_info'}`,
            arguments: isOwnerRequest
                ? [tx.pure(token.config.pool_registry_id), tx.pure(listOwnerAddr)]
                : [tx.pure(token.config.pool_registry_id)],
        });
        const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
            transactionBlock: tx,
            sender: simulationAccount.address,
        });
        const tokenList = [];
        simulateRes.events?.forEach((item) => {
            const formatType = extractStructTagFromType(item.type);
            if (formatType.full_address === `${token.token_display}::lp_list::FetchPoolListEvent`) {
                item.parsedJson.full_list.value_list.forEach((item) => {
                    tokenList.push(this.transformData(item, true));
                });
            }
        });
        this.updateCache(cacheKey, tokenList, cacheTime24h);
        return tokenList;
    }
    async factchWarpPoolList(poolOwnerAddr = '', coinOwnerAddr = '', forceRefresh = false) {
        const poolList = await this.factchPoolList(poolOwnerAddr, forceRefresh);
        if (poolList.length === 0) {
            return [];
        }
        const tokenList = await this.factchTokenList(coinOwnerAddr, forceRefresh);
        const lpPoolArray = [];
        for (const pool of poolList) {
            for (const token of tokenList) {
                if (token.address === pool.coin_a_address) {
                    pool.coinA = token;
                }
                if (token.address === pool.coin_b_address) {
                    pool.coinB = token;
                }
                continue;
            }
            lpPoolArray.push(pool);
        }
        return lpPoolArray;
    }
    async getTokenConfigEvent(forceRefresh = false) {
        const packageObjectId = this._sdk.sdkOptions.token.token_display;
        const cacheKey = `${packageObjectId}_getTokenConfigEvent`;
        const cacheData = this._cache[cacheKey];
        if (cacheData !== undefined && cacheData.getCacheData() && !forceRefresh) {
            return cacheData.value;
        }
        const packageObject = await this._sdk.fullClient.getObject({
            id: packageObjectId,
            options: {
                showPreviousTransaction: true,
            },
        });
        const previousTx = getObjectPreviousTransactionDigest(packageObject);
        const objects = await loopToGetAllQueryEvents(this._sdk, {
            query: { Transaction: previousTx },
        });
        const tokenConfigEvent = {
            coin_registry_id: '',
            pool_registry_id: '',
            coin_list_owner: '',
            pool_list_owner: '',
        };
        // console.log(objects.data)
        if (objects.data.length > 0) {
            objects.data.forEach((item) => {
                const formatType = extractStructTagFromType(item.type);
                if (item.transactionModule === 'coin_list') {
                    switch (formatType.name) {
                        case `InitListEvent`:
                            tokenConfigEvent.coin_list_owner = item.parsedJson.list_id;
                            break;
                        case `InitRegistryEvent`:
                            tokenConfigEvent.coin_registry_id = item.parsedJson.registry_id;
                            break;
                        default:
                            break;
                    }
                }
                else if (item.transactionModule === 'lp_list') {
                    switch (formatType.name) {
                        case `InitListEvent<address>`:
                            tokenConfigEvent.pool_list_owner = item.parsedJson.list_id;
                            break;
                        case `InitRegistryEvent<address>`:
                            tokenConfigEvent.pool_registry_id = item.parsedJson.registry_id;
                            break;
                        default:
                            break;
                    }
                }
            });
        }
        if (tokenConfigEvent.coin_registry_id.length > 0) {
            this.updateCache(cacheKey, tokenConfigEvent, cacheTime24h);
        }
        return tokenConfigEvent;
    }
    transformData(item, isPoolData) {
        const token = { ...item };
        if (isPoolData) {
            try {
                token.coin_a_address = extractStructTagFromType(token.coin_a_address).full_address;
                token.coin_b_address = extractStructTagFromType(token.coin_b_address).full_address;
            }
            catch (error) {
                //
            }
        }
        else {
            token.address = extractStructTagFromType(token.address).full_address;
        }
        if (item.extensions) {
            const extensionsDataArray = item.extensions.contents;
            for (const item of extensionsDataArray) {
                const { key } = item;
                let { value } = item;
                if (key === 'labels') {
                    try {
                        value = JSON.parse(decodeURIComponent(Base64.decode(value)));
                        // eslint-disable-next-line no-empty
                    }
                    catch (error) { }
                }
                token[key] = value;
            }
            delete token.extensions;
        }
        return token;
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
    getCacheData(cacheKey) {
        const cacheData = this._cache[cacheKey];
        if (cacheData !== undefined && cacheData.getCacheData()) {
            return cacheData.value;
        }
        return null;
    }
}
