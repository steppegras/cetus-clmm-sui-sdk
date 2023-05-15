export const CLOCK_ADDRESS = '0x0000000000000000000000000000000000000000000000000000000000000006';
export const ClmmIntegratePoolModule = 'pool_script';
export const ClmmIntegrateRouterModule = 'router_script';
export const ClmmFetcherModule = 'fetcher_script';
export const CoinInfoAddress = '0x1::coin::CoinInfo';
export const CoinStoreAddress = '0x1::coin::CoinStore';
export const PoolLiquidityCoinType = 'PoolLiquidityCoin';
export const getDefaultSuiInputType = (value) => {
    if (typeof value === 'string' && value.startsWith('0x')) {
        return 'object';
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
        return 'u64';
    }
    if (typeof value === 'boolean') {
        return 'bool';
    }
    throw new Error(`Unknown type for value: ${value}`);
};
