/* eslint-disable camelcase */
import { getObjectFields, getObjectId } from '@mysten/sui.js';
import { extractStructTagFromType } from './contracts';
import { CONFIG_PERCENT_MULTIPER } from '../types/booster_type';
import { d } from './numbers';
import { buildPosition } from './common';
export class MakerUtil {
    static buildPoolImmutables(data) {
        const { fields } = data.value.fields.value;
        const pool = {
            clmm_pool_id: extractStructTagFromType(fields.clmm_pool_id).address,
            bonus_type: extractStructTagFromType(fields.bonus_type.fields.name).source_address,
            pool_id: extractStructTagFromType(fields.pool_id).address,
            coinTypeA: extractStructTagFromType(fields.coin_type_a.fields.name).source_address,
            coinTypeB: extractStructTagFromType(fields.coin_type_b.fields.name).source_address,
        };
        return pool;
    }
    static buildPoolState(data) {
        const fields = getObjectFields(data);
        const rewarderMultipliers = [];
        fields.config.fields.contents.forEach((item) => {
            rewarderMultipliers.push({
                rate: Number(d(item.fields.key).div(CONFIG_PERCENT_MULTIPER)),
                multiplier: Number(d(item.fields.value).div(CONFIG_PERCENT_MULTIPER)),
            });
        });
        const pool = {
            balance: fields.balance,
            config: rewarderMultipliers,
            is_open: fields.is_open,
            index: Number(fields.index),
            start_time: Number(fields.start_time),
            interval_day: Number(fields.interval_day),
            minimum_percent_to_reward: Number(d(fields.minimum_percent_to_reward).div(CONFIG_PERCENT_MULTIPER)),
            rewarders: {
                rewarder_handle: fields.rewarders.fields.id.id,
                size: Number(fields.rewarders.fields.size),
            },
            whale_nfts: {
                whale_nfts_handle: fields.whale_nfts.fields.id.id,
                size: Number(fields.whale_nfts.fields.size),
            },
            points: {
                point_handle: fields.points.fields.id.id,
                size: Number(fields.points.fields.size),
            },
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
    static buildMarkerPositions(data) {
        const { contents } = data.value.fields.value.fields;
        const mList = [];
        const period_id = data.id.id;
        contents.forEach((item) => {
            const { key, value } = item.fields;
            const info = {
                id: key,
                period_id,
                bonus_num: value.fields.bonus_num,
                point: value.fields.point,
                is_burn: value.fields.is_burn,
                point_after_multiplier: value.fields.point_after_multiplier,
                percent: Number(d(value.fields.percent).div(CONFIG_PERCENT_MULTIPER)),
                fee_share_rate: 0,
                is_redeemed: value.fields.is_redeemed,
            };
            mList.push(info);
        });
        return mList;
    }
    static buildPoolBonusInfo(data) {
        const { fields, type } = data.value.fields.value;
        const bonusInfo = {
            type,
            time: Number(fields.time),
            settle_time: Number(fields.settle_time),
            settled_num: fields.settled_num,
            is_settled: fields.is_settled,
            basis_bonus: fields.basis_bonus,
            total_bonus: fields.total_bonus,
            is_vacant: fields.is_vacant,
            redeemed_num: fields.redeemed_num,
        };
        return bonusInfo;
    }
    static getBonusPercent(configs, percent) {
        let level_now = 0;
        for (const config of configs) {
            if (percent >= config.rate && config.rate > level_now) {
                level_now = config.multiplier;
            }
        }
        return level_now;
    }
}
