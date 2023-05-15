/* eslint-disable camelcase */
import BN from 'bn.js';
import { ZERO } from '../math/utils';
export function transClmmpoolDataWithoutTicks(pool) {
    const poolData = {
        coinA: pool.coinTypeA,
        coinB: pool.coinTypeB,
        currentSqrtPrice: new BN(pool.current_sqrt_price),
        currentTickIndex: pool.current_tick_index,
        feeGrowthGlobalA: new BN(pool.fee_growth_global_a),
        feeGrowthGlobalB: new BN(pool.fee_growth_global_b),
        feeProtocolCoinA: new BN(pool.fee_protocol_coin_a),
        feeProtocolCoinB: new BN(pool.fee_protocol_coin_b),
        feeRate: new BN(pool.fee_rate),
        liquidity: new BN(pool.liquidity),
        tickIndexes: [],
        tickSpacing: Number(pool.tickSpacing),
        ticks: [],
        collection_name: '',
    };
    return poolData;
}
export function newBits(index) {
    const index_BN = new BN(index);
    if (index_BN.lt(ZERO)) {
        return {
            bits: index_BN
                .neg()
                .xor(new BN(2).pow(new BN(64)).sub(new BN(1)))
                .add(new BN(1))
                .toString(),
        };
    }
    return {
        bits: index_BN.toString(),
    };
}
