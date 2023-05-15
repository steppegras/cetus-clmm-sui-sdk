import { Connection, JsonRpcProvider } from '@mysten/sui.js';
import { BoosterModule } from './modules/boosterModule';
import { LaunchpadModule } from './modules/launchpadModule';
import { MakerModule } from './modules/makerModule';
import { PoolModule } from './modules/poolModule';
import { PositionModule } from './modules/positionModule';
import { ResourcesModule } from './modules/resourcesModule';
import { RewarderModule } from './modules/rewarderModule';
import { RouterModule } from './modules/routerModule';
import { SwapModule } from './modules/swapModule';
import { TokenModule } from './modules/tokenModule';
import { XCetusModule } from './modules/xcetusModule';
import GasConfig from './utils/gas_config';
export class SDK {
    _fullClient;
    _pool;
    _position;
    _swap;
    _resources;
    _rewarder;
    _router;
    _token;
    _sdkOptions;
    _launchpad;
    _xcetusModule;
    _boosterModule;
    _makerModule;
    _senderAddress = '';
    _gasConfig;
    constructor(options) {
        this._sdkOptions = options;
        this._fullClient = new JsonRpcProvider(new Connection({
            fullnode: options.fullRpcUrl,
            faucet: options.faucetURL,
        }));
        this._swap = new SwapModule(this);
        this._resources = new ResourcesModule(this);
        this._pool = new PoolModule(this);
        this._position = new PositionModule(this);
        this._rewarder = new RewarderModule(this);
        this._router = new RouterModule(this);
        this._token = new TokenModule(this);
        this._launchpad = new LaunchpadModule(this);
        this._xcetusModule = new XCetusModule(this);
        this._boosterModule = new BoosterModule(this);
        this._makerModule = new MakerModule(this);
        this._gasConfig = new GasConfig(1);
    }
    get senderAddress() {
        return this._senderAddress;
    }
    set senderAddress(value) {
        this._senderAddress = value;
    }
    set gasConfig(value) {
        this._gasConfig = value;
    }
    get gasConfig() {
        return this._gasConfig;
    }
    get Swap() {
        return this._swap;
    }
    get fullClient() {
        return this._fullClient;
    }
    get Resources() {
        return this._resources;
    }
    get sdkOptions() {
        return this._sdkOptions;
    }
    get Pool() {
        return this._pool;
    }
    get Position() {
        return this._position;
    }
    get Rewarder() {
        return this._rewarder;
    }
    get Router() {
        return this._router;
    }
    get Token() {
        return this._token;
    }
    get Launchpad() {
        return this._launchpad;
    }
    get XCetusModule() {
        return this._xcetusModule;
    }
    get BoosterModule() {
        return this._boosterModule;
    }
    get MakerModule() {
        return this._makerModule;
    }
}
