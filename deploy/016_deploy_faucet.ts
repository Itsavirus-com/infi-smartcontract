import { Faucet__factory } from '@project/contracts/typechain';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

type DeployArgs = Parameters<Faucet__factory['deploy']>;

const NAME = 'Faucet';

const func: DeployFunction = async function ({
  network,
  deployments,
  getNamedAccounts,
}: HardhatRuntimeEnvironment) {
  if (!network.tags.goerli) {
    console.warn(`Only deploy to Goerli`);
    return;
  }

  const deployed = network.live && (await deployments.getOrNull(NAME));
  if (deployed) return;

  const { deployer: deployerAddress } = await getNamedAccounts();

  const USDT = await deployments.get('USDT');
  const DAI = await deployments.get('DAI');
  const INFI = await deployments.get('INFI');
  const USDC = await deployments.get('FiatTokenProxyUSDC');

  const args: DeployArgs = [
    INFI.address,
    DAI.address,
    USDT.address,
    USDC.address,
  ];

  await deployments.deploy(NAME, {
    from: deployerAddress,
    args,
    log: true,
  });
};

func.tags = ['Faucet'];

export default func;
