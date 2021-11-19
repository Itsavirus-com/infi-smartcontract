import {
  ClaimData,
  ClaimGateway,
  ClaimHelper,
  CollectiveClaimGateway,
  Config,
  Config__factory,
  CoverData,
  CoverGateway,
  ListingData,
  ListingGateway,
  PlatformData,
  Pool,
} from '@project/contracts/typechain';
import { HardhatRuntimeEnvironment } from 'hardhat/types'; // This adds the type from hardhat runtime environment.
import { DeployFunction } from 'hardhat-deploy/types'; // This adds the type that a deploy function is expected to fulfill.

import { addUpgradeToFunctionToABI } from '../scripts/utils/deployHelper';
import { hex } from '../test/unit/utils/helpers';

type DeployArgs = Parameters<Config__factory['deploy']>;

const NAME = 'Config';

async function getExternalDeployments(
  deployments: HardhatRuntimeEnvironment['deployments']
) {
  return {
    INFI:
      (await deployments.getOrNull('UChildERC20ProxyINFI')) ||
      (await deployments.getOrNull('UChildERC20ProxyINFIDummy')) ||
      (await deployments.get('INFI')),
    USDT:
      (await deployments.getOrNull('UChildERC20ProxyUSDT')) ||
      (await deployments.getOrNull('UChildERC20ProxyUSDTDummy')) ||
      (await deployments.get('USDT')),
    USDC:
      (await deployments.getOrNull('UChildERC20ProxyUSDC')) ||
      (await deployments.getOrNull('UChildERC20ProxyUSDCDummy')) ||
      (await deployments.getOrNull('FiatTokenProxyUSDC')) ||
      (await deployments.get('USDC')),
    DAI:
      (await deployments.getOrNull('UChildERC20ProxyDAI')) ||
      (await deployments.getOrNull('UChildERC20ProxyDAIDummy')) ||
      (await deployments.get('DAI')),
  };
}

const func: DeployFunction = async function ({
  ethers,
  network,
  deployments,
  getNamedAccounts,
  config: hreConfig,
}: HardhatRuntimeEnvironment) {
  const deployed = network.live && (await deployments.getOrNull(NAME));
  if (deployed) return;

  // Fetch the accounts. These can be configured in hardhat.config.ts under namedAccounts.
  // const { deployer } = await ethers.getNamedSigners();
  const {
    deployer: deployerAddress,
    coinSigner: coinSignerAddress,
    devWallet: devWalletAddress,
  } = await getNamedAccounts();
  const { deployer } = await ethers.getNamedSigners();

  const args: DeployArgs = [];

  await deployments.deploy(NAME, {
    // This will create a deployment called 'Market'. By default it will look for an artifact with the same name. The 'contract' option allows you to use a different artifact.
    from: deployerAddress, // Deployer will be performing the deployment transaction.
    args, // Arguments to thecontract's constructor.
    log: true, // Display the address and gas used in the console (not when run in test though).
    proxy: {
      owner: deployerAddress,
      proxyContract: 'UUPSProxy',
      execute: {
        methodName: 'initialize',
        args: [],
      },
    },
  });

  if (network.live) {
    addUpgradeToFunctionToABI(hreConfig.paths.deployments, NAME, network.name);
  }
  // Setting Config Contract & Internal Contract
  const config = await ethers.getContract<Config>(NAME, deployerAddress);
  const ld = await ethers.getContract<ListingData>(
    'ListingData',
    deployerAddress
  );
  const lg = await ethers.getContract<ListingGateway>(
    'ListingGateway',
    deployerAddress
  );
  const pl = await ethers.getContract<Pool>('Pool', deployerAddress);
  const cd = await ethers.getContract<CoverData>('CoverData', deployerAddress);
  const cg = await ethers.getContract<CoverGateway>(
    'CoverGateway',
    deployerAddress
  );
  const claimData = await ethers.getContract<ClaimData>(
    'ClaimData',
    deployerAddress
  );
  const claimGateway = await ethers.getContract<ClaimGateway>(
    'ClaimGateway',
    deployerAddress
  );
  const collectiveClaimGateway = await ethers.getContract<CollectiveClaimGateway>(
    'CollectiveClaimGateway',
    deployerAddress
  );
  const platformData = await ethers.getContract<PlatformData>(
    'PlatformData',
    deployerAddress
  );
  const claimHelper = await ethers.getContract<ClaimHelper>('ClaimHelper');

  const { INFI, USDT, USDC, DAI } = await getExternalDeployments(deployments);

  await config.connect(deployer).addNewInternalContract(hex('LD'), ld.address);
  await config.connect(deployer).addNewInternalContract(hex('LG'), lg.address);
  await config.connect(deployer).addNewInternalContract(hex('PL'), pl.address);
  await config.connect(deployer).addNewInternalContract(hex('CD'), cd.address);
  await config.connect(deployer).addNewInternalContract(hex('CG'), cg.address);
  await config
    .connect(deployer)
    .addNewInternalContract(hex('CM'), claimData.address);
  await config
    .connect(deployer)
    .addNewInternalContract(hex('CL'), claimGateway.address);
  await config
    .connect(deployer)
    .addNewInternalContract(hex('CC'), collectiveClaimGateway.address);
  await config
    .connect(deployer)
    .addNewInternalContract(hex('CH'), claimHelper.address);
  await config
    .connect(deployer)
    .addNewInternalContract(hex('PD'), platformData.address);

  // Set INFI Token Address to Config
  await config.connect(deployer).setInfiTokenAddr(INFI.address);
  await config.connect(deployer).setLatestAddress(hex('CS'), coinSignerAddress);
  await config.connect(deployer).setLatestAddress(hex('DW'), devWalletAddress);
  await config.connect(deployer).setLatestAddress(hex('DT'), DAI.address);
  await config.connect(deployer).setLatestAddress(hex('UT'), USDT.address);
  await config.connect(deployer).setLatestAddress(hex('UC'), USDC.address);

  await cd.connect(deployer).changeConfigAddress(config.address);
  await ld.connect(deployer).changeConfigAddress(config.address);
  await lg.connect(deployer).changeConfigAddress(config.address);
  await lg.connect(deployer).changeDependentContractAddress();
  await pl.connect(deployer).changeConfigAddress(config.address);
  await pl.connect(deployer).changeDependentContractAddress();
  await cg.connect(deployer).changeConfigAddress(config.address);
  await cg.connect(deployer).changeDependentContractAddress();
  await claimData.connect(deployer).changeConfigAddress(config.address);
  await claimGateway.connect(deployer).changeConfigAddress(config.address);
  await claimGateway.connect(deployer).changeDependentContractAddress();
  await claimHelper.connect(deployer).changeConfigAddress(config.address);
  await claimHelper.connect(deployer).changeDependentContractAddress();
  await collectiveClaimGateway
    .connect(deployer)
    .changeConfigAddress(config.address);
  await collectiveClaimGateway
    .connect(deployer)
    .changeDependentContractAddress();
  await platformData.connect(deployer).changeConfigAddress(config.address);

  // Set up Oracles
  const ethereum_mainnet = 1;
  await platformData
    .connect(deployer)
    .addNewOracle('Chainlink', 'https://chain.link/');
  const oracleId = 0;
  // Price Feeds for Mumbai
  await platformData
    .connect(deployer)
    .addNewPriceFeed(
      'dai',
      oracleId,
      ethereum_mainnet,
      8,
      '0x0FCAa9c899EC5A91eBc3D5Dd869De833b06fB046'
    );
  await platformData
    .connect(deployer)
    .addNewPriceFeed(
      'usd-coin',
      oracleId,
      ethereum_mainnet,
      8,
      '0x572dDec9087154dC5dfBB1546Bb62713147e0Ab0'
    );
  await platformData
    .connect(deployer)
    .addNewPriceFeed(
      'tether',
      oracleId,
      ethereum_mainnet,
      8,
      '0x92C09849638959196E976289418e5973CC96d645'
    );

  //
  console.log(
    'Deploy Done on block : ',
    await ethers.provider.getBlock('latest')
  );
  console.log('Listing Data : ', await ld.address);
  console.log('Platform Data : ', await platformData.address);
  console.log('Pool : ', await pl.address);
  console.log('Cover Data: ', await cd.address);
  console.log('Listing Gateway: ', await lg.address);
  console.log('Claim Data: ', await claimData.address);
  console.log('Claim Gateway: ', await claimGateway.address);
  console.log(
    'Collective Claim Gateway: ',
    await collectiveClaimGateway.address
  );
  console.log('Claim Helper: ', await claimHelper.address);
};

func.tags = ['Config']; // This sets up a tag so you can execute the script on its own (and its dependencies).
func.dependencies = [
  'ListingData',
  'CoverData',
  'ClaimData',
  'PlatformData',
  'Pool',
  'ListingGateway',
  'CoverGateway',
  'ClaimGateway',
  'CollectiveClaimGateway',
];

export default func;
