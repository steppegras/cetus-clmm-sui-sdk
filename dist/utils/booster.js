/* eslint-disable camelcase */
import { getObjectFields, getObjectId } from '@mysten/sui.js';
import { extractStructTagFromType } from './contracts';
import { CONFIG_PERCENT_MULTIPER, } from '../types/booster_type';
import { d } from './numbers';
import { buildPosition } from './common';
export class BoosterUtil {
    static buildPoolImmutables(data) {
        const { fields } = data.value.fields.value;
        const pool = {
            clmm_pool_id: extractStructTagFromType(fields.clmm_pool_id).address,
            booster_type: extractStructTagFromType(fields.booster_type.fields.name).source_address,
            pool_id: extractStructTagFromType(fields.pool_id).address,
            coinTypeA: extractStructTagFromType(fields.coin_type_a.fields.name).source_address,
            coinTypeB: extractStructTagFromType(fields.coin_type_b.fields.name).source_address,
        };
        return pool;
    }
    static buildPoolState(data) {
        const fields = getObjectFields(data);
        const lockMultipliers = [];
        fields.config.fields.contents.forEach((item) => {
            lockMultipliers.push({
                lock_day: Number(item.fields.key),
                multiplier: Number(d(item.fields.value).div(CONFIG_PERCENT_MULTIPER)),
            });
        });
        const pool = {
            basic_percent: Number(d(fields.basic_percent).div(CONFIG_PERCENT_MULTIPER)),
            balance: fields.balance,
            config: lockMultipliers,
            lock_positions: {
                lock_positions_handle: fields.lock_positions.fields.id.id,
                size: fields.lock_positions.fields.size,
            },
            is_open: fields.is_open,
            index: Number(fields.index),
        };
        return pool;
    }
    static buildLockNFT(data) {
        const locked_nft_id = extractStructTagFromType(getObjectId(data)).address;
        const fields = getObjectFields(data);
        if (fields) {
            const lock_clmm_position = buildPosition(data);
            const lockNFT = {
                lock_clmm_position,
                locked_nft_id,
                locked_time: Number(fields.locked_time),
                end_lock_time: Number(fields.end_lock_time),
            };
            return lockNFT;
        }
        return undefined;
    }
    static buildLockPositionInfo(data) {
        const id = extractStructTagFromType(getObjectId(data)).address;
        const fields = getObjectFields(data);
        if (fields) {
            const { value } = fields.value.fields;
            const lockNFT = {
                id,
                type: value.type,
                position_id: value.fields.position_id,
                start_time: Number(value.fields.start_time),
                lock_period: Number(value.fields.lock_period),
                end_time: Number(value.fields.end_time),
                growth_rewarder: value.fields.growth_rewarder,
                xcetus_owned: value.fields.xcetus_owned,
                is_settled: value.fields.is_settled,
            };
            return lockNFT;
        }
        return undefined;
    }
    static isLocked(lock) {
        return lock.end_lock_time > Date.parse(new Date().toString()) / 1000;
    }
}
