import { normalizeSuiAddress, TransactionBlock } from '@mysten/sui.js';
import { TransactionUtil } from '../utils/transaction-util';
import { tickScore } from '../math';
import { asUintN, buildPositionReward, buildTickData, buildTickDataByEvent, multiGetObjects } from '../utils/common';
import { extractStructTagFromType, isSortedSymbols } from '../utils/contracts';
import { ClmmFetcherModule, ClmmIntegratePoolModule, CLOCK_ADDRESS } from '../types/sui';
export class PoolModule {
    _sdk;
    constructor(sdk) {
        this._sdk = sdk;
    }
    get sdk() {
        return this._sdk;
    }
    async creatPoolsTransactionPayload(paramss) {
        for (const params of paramss) {
            if (isSortedSymbols(normalizeSuiAddress(params.coinTypeA), normalizeSuiAddress(params.coinTypeB))) {
                const swpaCoinTypeB = params.coinTypeB;
                params.coinTypeB = params.coinTypeA;
                params.coinTypeA = swpaCoinTypeB;
            }
        }
        return await this.creatPool(paramss);
    }
    /**
     * Create a pool of clmmpool protocol. The pool is identified by (CoinTypeA, CoinTypeB, tick_spacing).
     * @param params
     * @returns
     */
    async creatPoolTransactionPayload(params) {
        if (isSortedSymbols(normalizeSuiAddress(params.coinTypeA), normalizeSuiAddress(params.coinTypeB))) {
            const swpaCoinTypeB = params.coinTypeB;
            params.coinTypeB = params.coinTypeA;
            params.coinTypeA = swpaCoinTypeB;
        }
        if ('fix_amount_a' in params) {
            return await this.creatPoolAndAddLiquidity(params);
        }
        return await this.creatPool([params]);
    }
    async creatPool(paramss) {
        const tx = new TransactionBlock();
        const { clmm } = this.sdk.sdkOptions;
        const eventConfig = clmm.config;
        if (eventConfig === undefined) {
            throw Error('eventConfig is null');
        }
        const globalPauseStatusObjectId = eventConfig.global_config_id;
        const poolsId = eventConfig.pools_id;
        tx.setGasBudget(this._sdk.gasConfig.GasBudgetHigh2);
        paramss.forEach((params) => {
            const args = [
                tx.object(globalPauseStatusObjectId),
                tx.object(poolsId),
                tx.pure(params.tick_spacing.toString()),
                tx.pure(params.initialize_sqrt_price),
                tx.pure(params.uri),
                tx.object(CLOCK_ADDRESS),
            ];
            tx.moveCall({
                target: `${clmm.clmm_router.cetus}::${ClmmIntegratePoolModule}::create_pool`,
                typeArguments: [params.coinTypeA, params.coinTypeB],
                arguments: args,
            });
        });
        return tx;
    }
    async creatPoolAndAddLiquidity(params) {
        if (this._sdk.senderAddress.length === 0) {
            throw Error('this config sdk senderAddress is empty');
        }
        const tx = new TransactionBlock();
        const { clmm } = this.sdk.sdkOptions;
        const eventConfig = clmm.config;
        if (eventConfig === undefined) {
            throw Error('eventConfig is null');
        }
        const globalPauseStatusObjectId = eventConfig.global_config_id;
        const poolsId = eventConfig.pools_id;
        const allCoinAsset = await this._sdk.Resources.getOwnerCoinAssets(this._sdk.senderAddress);
        tx.setGasBudget(this._sdk.gasConfig.GasBudgetHigh2);
        const primaryCoinAInputsR = TransactionUtil.buildCoinInputForAmount(tx, allCoinAsset, BigInt(params.amount_a), params.coinTypeA)?.transactionArgument;
        const primaryCoinBInputsR = TransactionUtil.buildCoinInputForAmount(tx, allCoinAsset, BigInt(params.amount_b), params.coinTypeB)?.transactionArgument;
        const primaryCoinAInputs = primaryCoinAInputsR;
        const primaryCoinBInputs = primaryCoinBInputsR;
        const primaryCoinInputs = [];
        if (primaryCoinAInputs) {
            primaryCoinInputs.push({
                coinInput: primaryCoinAInputs,
                coinAmount: params.amount_a.toString(),
            });
        }
        if (primaryCoinBInputs) {
            primaryCoinInputs.push({
                coinInput: primaryCoinBInputs,
                coinAmount: params.amount_b.toString(),
            });
        }
        let addLiquidityName;
        if (primaryCoinInputs.length === 2) {
            addLiquidityName = 'create_pool_with_liquidity_with_all';
        }
        else {
            addLiquidityName = primaryCoinAInputs !== undefined ? 'create_pool_with_liquidity_only_a' : 'create_pool_with_liquidity_only_b';
        }
        const args = [
            tx.pure(globalPauseStatusObjectId),
            tx.pure(poolsId),
            tx.pure(params.tick_spacing.toString()),
            tx.pure(params.initialize_sqrt_price),
            tx.pure(params.uri),
            ...primaryCoinInputs.map((item) => item.coinInput),
            tx.pure(asUintN(BigInt(params.tick_lower)).toString()),
            tx.pure(asUintN(BigInt(params.tick_upper)).toString()),
            ...primaryCoinInputs.map((item) => tx.pure(item.coinAmount)),
            // tx.pure(params.fix_amount_a),
            // tx.pure(CLOCK_ADDRESS),
        ];
        if (addLiquidityName === 'create_pool_with_liquidity_with_all') {
            args.push(tx.pure(params.fix_amount_a));
        }
        args.push(tx.pure(CLOCK_ADDRESS));
        tx.moveCall({
            target: `${clmm.clmm_router.cetus}::${ClmmIntegratePoolModule}::${addLiquidityName}`,
            typeArguments: [params.coinTypeA, params.coinTypeB],
            arguments: args,
        });
        return tx;
    }
    async fetchTicks(params) {
        let ticks = [];
        let start = [];
        const limit = 512;
        while (true) {
            // eslint-disable-next-line no-await-in-loop
            const data = await this.getTicks({
                pool_id: params.pool_id,
                coinTypeA: params.coinTypeA,
                coinTypeB: params.coinTypeB,
                start,
                limit,
            });
            // console.log('data: ', data)
            ticks = [...ticks, ...data];
            if (data.length < limit) {
                break;
            }
            start = [data[data.length - 1].index];
        }
        return ticks;
    }
    async getTicks(params) {
        const { clmm, simulationAccount } = this.sdk.sdkOptions;
        const ticks = [];
        const typeArguments = [params.coinTypeA, params.coinTypeB];
        const tx = new TransactionBlock();
        const args = [tx.pure(params.pool_id), tx.pure(params.start), tx.pure(params.limit.toString())];
        tx.moveCall({
            target: `${clmm.clmm_router.cetus}::${ClmmFetcherModule}::fetch_ticks`,
            arguments: args,
            typeArguments,
        });
        console.log('payload: ', tx.blockData.transactions[0]);
        const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
            transactionBlock: tx,
            sender: simulationAccount.address,
        });
        // console.log('simulateRes: ', simulateRes.events)
        simulateRes.events?.forEach((item) => {
            if (extractStructTagFromType(item.type).name === `FetchTicksResultEvent`) {
                item.parsedJson.ticks.forEach((tick) => {
                    ticks.push(buildTickDataByEvent(tick));
                });
            }
        });
        return ticks;
    }
    async fetchPositionRewardList(params) {
        const { clmm, simulationAccount } = this.sdk.sdkOptions;
        const allPosition = [];
        let start = [];
        const limit = 512;
        while (true) {
            const typeArguments = [params.coinTypeA, params.coinTypeB];
            const tx = new TransactionBlock();
            const args = [tx.pure(params.pool_id), tx.pure(start), tx.pure(limit.toString())];
            tx.moveCall({
                target: `${clmm.clmm_router.cetus}::${ClmmFetcherModule}::fetch_positions`,
                arguments: args,
                typeArguments,
            });
            const simulateRes = await this.sdk.fullClient.devInspectTransactionBlock({
                transactionBlock: tx,
                sender: simulationAccount.address,
            });
            const positionRewards = [];
            simulateRes.events?.forEach((item) => {
                if (extractStructTagFromType(item.type).name === `FetchPositionsEvent`) {
                    item.parsedJson.positions.forEach((item) => {
                        const positionReward = buildPositionReward(item);
                        positionRewards.push(positionReward);
                    });
                }
            });
            allPosition.push(...positionRewards);
            if (positionRewards.length < limit) {
                break;
            }
            else {
                start = [positionRewards[positionRewards.length - 1].pos_object_id];
            }
        }
        return allPosition;
    }
    async fetchTicksByRpc(tickHandle) {
        let allTickData = [];
        let nextCursor = null;
        const limit = 512;
        while (true) {
            const allTickId = [];
            // eslint-disable-next-line no-await-in-loop
            const idRes = await this.sdk.fullClient.getDynamicFields({
                parentId: tickHandle,
                cursor: nextCursor,
                limit,
            });
            // console.log('idRes: ', idRes.data)
            nextCursor = idRes.nextCursor;
            // eslint-disable-next-line no-loop-func
            idRes.data.forEach((item) => {
                if (extractStructTagFromType(item.objectType).module === 'skip_list') {
                    allTickId.push(item.objectId);
                }
            });
            // eslint-disable-next-line no-await-in-loop
            allTickData = [...allTickData, ...(await this.getTicksByRpc(allTickId))];
            if (nextCursor === null || idRes.data.length < limit) {
                break;
            }
        }
        return allTickData;
    }
    async getTicksByRpc(tickObjectId) {
        const ticks = [];
        const objectDataResponses = await multiGetObjects(this.sdk, tickObjectId, { showContent: true, showType: true });
        // eslint-disable-next-line no-restricted-syntax
        for (const suiObj of objectDataResponses) {
            ticks.push(buildTickData(suiObj));
        }
        return ticks;
    }
    async getTickDataByIndex(tickHandle, tickIndex) {
        const name = { type: 'u64', value: asUintN(BigInt(tickScore(tickIndex).toString())).toString() };
        const res = await this.sdk.fullClient.getDynamicFieldObject({
            parentId: tickHandle,
            name,
        });
        return buildTickData(res);
    }
    async getTickDataByObjectId(tickId) {
        const res = await this.sdk.fullClient.getObject({
            id: tickId,
            options: { showContent: true },
        });
        return buildTickData(res);
    }
}
