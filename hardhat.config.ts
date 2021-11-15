import { config as dotEnvConfig } from 'dotenv';
import { HardhatUserConfig } from 'hardhat/types';

import '@nomiclabs/hardhat-waffle';
import '@typechain/hardhat';
import '@nomiclabs/hardhat-etherscan';
import '@nomiclabs/hardhat-ethers';
import 'hardhat-deploy';
import 'hardhat-gas-reporter';
import '@tenderly/hardhat-tenderly';
import '@asheliahut/hardhat-react';
// TODO: reenable solidity-coverage when it works
// import "solidity-coverage";
import './hardhat-tasks';

dotEnvConfig({ path: '../../.env' });

const { INFURA_API_KEY = '9aa3d95b3bc440fa88ea12eaa4456161' } = process.env; // well known api key

const {
  ALCHEMY_API_KEY,
  // ALCHEMY_GOERLI_API_KEY = ALCHEMY_API_KEY,
  ALCHEMY_MUMBAI_API_KEY = ALCHEMY_API_KEY,
  ALCHEMY_GOERLI_API_KEY,
} = process.env;

const {
  CHAINSTACK_API_KEY,
  CHAINSTACK_MUMBAI_API_KEY = CHAINSTACK_API_KEY,
} = process.env;

const { SPEEDY_NODES_API_KEY } = process.env;

const { OPTIMIZER_DISABLED = false, OPTIMIZER_RUNS = '200' } = process.env;

const {
  TESTNET_PRIVATE_KEY = '', // NOTE : SETUP YOUR PRIVATE KEY
  TESTNET_PRIVATE_KEY_0 = TESTNET_PRIVATE_KEY,
  TESTNET_PRIVATE_KEY_1 = TESTNET_PRIVATE_KEY,
  TESTNET_PRIVATE_KEY_2 = TESTNET_PRIVATE_KEY,
  TESTNET_PRIVATE_KEY_3 = TESTNET_PRIVATE_KEY,
  GOERLI_PRIVATE_KEY_0 = TESTNET_PRIVATE_KEY_0,
  GOERLI_PRIVATE_KEY_1 = TESTNET_PRIVATE_KEY_1,
  GOERLI_PRIVATE_KEY_2 = TESTNET_PRIVATE_KEY_2,
  GOERLI_PRIVATE_KEY_3 = TESTNET_PRIVATE_KEY_3,
  MUMBAI_PRIVATE_KEY_0 = TESTNET_PRIVATE_KEY_0,
  MUMBAI_PRIVATE_KEY_1 = TESTNET_PRIVATE_KEY_1,
  MUMBAI_PRIVATE_KEY_2 = TESTNET_PRIVATE_KEY_2,
  MUMBAI_PRIVATE_KEY_3 = TESTNET_PRIVATE_KEY_3,
} = process.env;

const { ETHERSCAN_API_KEY, POLYGONSCAN_API_KEY } = process.env;
const { COINMARKETCAP_API_KEY } = process.env;

const solcSettings = {
  optimizer: {
    enabled: !OPTIMIZER_DISABLED,
    runs: +OPTIMIZER_RUNS,
  },
  outputSelection: {
    '*': {
      '*': ['storageLayout'],
    },
  },
};

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  solidity: {
    compilers: [
      {
        version: '0.8.2',
        settings: solcSettings,
      },
    ],
  },
  networks: {
    hardhat: {
      tags: ['test', 'local'],
      chainId: 80001,
      forking: {
        // url: `https://speedy-nodes-nyc.moralis.io/${SPEEDY_NODES_API_KEY}/polygon/mumbai/archive`,
        url: `https://nd-011-565-225.p2pify.com/${CHAINSTACK_MUMBAI_API_KEY}`,
        blockNumber: 17077993, // See: https://mumbai.polygonscan.com/block/16638089
        // network: 'mumbai',
      },
    },
    localhost: {
      tags: ['local'],
      timeout: 60_000,
    },
    mumbai: {
      tags: ['child'],
      url: `https://polygon-mumbai.g.alchemy.com/v2/${ALCHEMY_MUMBAI_API_KEY}`,
      // url: `https://polygon-mumbai.infura.io/v3/${INFURA_API_KEY}`,
      accounts: [
        MUMBAI_PRIVATE_KEY_0,
        MUMBAI_PRIVATE_KEY_1,
        MUMBAI_PRIVATE_KEY_2,
        MUMBAI_PRIVATE_KEY_3,
      ],
    },
    goerli: {
      tags: ['goerli'],
      url: `https://eth-goerli.alchemyapi.io/v2/${ALCHEMY_GOERLI_API_KEY}`,
      // url: `https://polygon-mumbai.infura.io/v3/${INFURA_API_KEY}`,
      accounts: [
        GOERLI_PRIVATE_KEY_0,
        GOERLI_PRIVATE_KEY_1,
        GOERLI_PRIVATE_KEY_2,
        GOERLI_PRIVATE_KEY_3,
      ],
    },
    coverage: {
      url: 'http://127.0.0.1:8555', // Coverage launches its own ganache-cli client
    },
  },
  mocha: {
    timeout: 60_000,
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/ or https://polygonscan.com/
    apiKey: ETHERSCAN_API_KEY || POLYGONSCAN_API_KEY,
  },
  gasReporter: {
    coinmarketcap: COINMARKETCAP_API_KEY,
  },
  paths: {
    deployments: '../contracts/deployments',
    react: '../react-app/src/generated',
  },
  typechain: {
    target: 'ethers-v5',
    outDir: '../react-app/src/generated/typechain',
    externalArtifacts: ['../contracts/deployments/external/*.json'],
  },
  namedAccounts: {
    test: {
      default: 0,
    },
    deployer: {
      default: 1,
      mumbai: '0x627306090abaB3A6e1400e9345bC60c78a8BEf57',
      goerli: '0x275bD4cb948eA43ba6C820CaB2E3d901937B243A',
    },
    coinSigner: {
      default: 2,
      mumbai: '0xCb02f258dFAc4D6B3bDc058623b9a08662310607',
    },
    devWallet: {
      default: 3,
      mumbai: '0xE427E7aE61902dafD6b52D6B322FA557e7309972',
    },
    funder1: {
      default: 4,
    },
    funder2: {
      default: 5,
    },
    holder1: {
      default: 6,
    },
    holder2: {
      default: 7,
    },
    holderINFI: {
      mainnet: '0x4555f0a5622a7D971610518B80Ae708591CE5202',
      hardhat: '0xAA538E637c37782E7E9524cAdaC4ac71Ce18ACc9',
    },
    minterINFI: {
      goerli: 0,
    },
    minterDAI: {
      goerli: 0,
      mainnet: '0x9759A6Ac90977b93B58547b4A71c78317f391A28',
    },
    minterUSDT: {
      goerli: 0,
      mainnet: '0xC6CDE7C39eB2f0F0095F41570af89eFC2C1Ea828',
    },
    minterUSDC: {
      goerli: 0,
      mainnet: '0x5B6122C109B78C6755486966148C1D70a50A47D7',
    },
    trustedForwarder: {
      default: '0x4d4581c01A457925410cd3877d17b2fd4553b2C5', // hardhat
      mainnet: '0xAa3E82b4c4093b4bA13Cb5714382C99ADBf750cA',
      mumbai: '0x4d4581c01A457925410cd3877d17b2fd4553b2C5',
      matic: '0xdA78a11FD57aF7be2eDD804840eA7f4c2A38801d',
      polygon: '0xdA78a11FD57aF7be2eDD804840eA7f4c2A38801d',
    },
    childChainManager: {
      default: '0xb5505a6d998549090530911180f38aC5130101c6', // hardhat
      mumbai: '0xb5505a6d998549090530911180f38aC5130101c6',
      matic: '0xA6FA4fB5f76172d178d61B04b0ecd319C5d1C0aa',
      polygon: '0xA6FA4fB5f76172d178d61B04b0ecd319C5d1C0aa',
    },
  },
  react: {
    providerPriority: ['web3modal', 'mumbai', 'hardhat'],
    fallbackProvider: 'mumbai',
    providerOptions: {
      walletconnect: {
        options: {
          rpc: {
            1: `https://mainnet.infura.io/v3/${INFURA_API_KEY}`,
            3: `https://ropsten.infura.io/v3/${INFURA_API_KEY}`,
            4: `https://rinkeby.infura.io/v3/${INFURA_API_KEY}`,
            5: `https://goerli.infura.io/v3/${INFURA_API_KEY}`,
            10: `https://optimism-mainnet.infura.io/v3/${INFURA_API_KEY}`,
            42: `https://kovan.infura.io/v3/${INFURA_API_KEY}`,
            69: `https://optimism-kovan.infura.io/v3/${INFURA_API_KEY}`,
            137: `https://polygon-mainnet.infura.io/v3/${INFURA_API_KEY}`,
            80001: `https://polygon-mumbai.infura.io/v3/${INFURA_API_KEY}`,
          },
        },
      },
    },
  },
  tenderly: {
    username: 'anggapur', // Change this value to username of your Tenderly Account
    project: 'infi', // Change this value to project name of your Tenderly Account
  },
};

export default config;
