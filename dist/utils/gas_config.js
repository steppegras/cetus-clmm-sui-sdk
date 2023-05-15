import { d } from './numbers';
class GasConfig {
    constructor(price = 1) {
        this.price = 1;
        this.GasBudgetLow = 60000000;
        this.GasBudgetMiddle = 75000000;
        this.GasBudgetMiddle2 = 90000000;
        this.GasBudgetHigh = 105000000;
        this.GasBudgetHigh2 = 240000000;
        this.GasBudgetHigh3 = 800000000;
        this.price = price;
        this.GasBudgetLow = Number(d(this.GasBudgetLow).mul(this.price).toFixed(0));
        this.GasBudgetMiddle = Number(d(this.GasBudgetMiddle).mul(this.price).toFixed(0));
        this.GasBudgetMiddle2 = Number(d(this.GasBudgetMiddle2).mul(this.price).toFixed(0));
        this.GasBudgetHigh = Number(d(this.GasBudgetHigh).mul(this.price).toFixed(0));
        this.GasBudgetHigh2 = Number(d(this.GasBudgetHigh2).mul(this.price).toFixed(0));
    }
}
export default GasConfig;
