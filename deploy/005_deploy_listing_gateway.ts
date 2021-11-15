import { ListingGateway__factory } from '@project/contracts/typechain';
import { HardhatRuntimeEnvironment } from 'hardhat/types'; // This adds the type from hardhat runtime environment.
import { DeployFunction } from 'hardhat-deploy/types'; // This adds the type that a deploy function is expected to fulfill.

type DeployArgs = Parameters<ListingGateway__factory['deploy']>;

const NAME = 'ListingGateway';

const func: DeployFunction = async function ({
  network,
  deployments,
  getNamedAccounts,
}: HardhatRuntimeEnvironment) {
  const deployed = network.live && (await deployments.getOrNull(NAME));
  if (deployed) return;

  // Fetch the accounts. These can be configured in hardhat.config.ts under namedAccounts.
  // const { deployer } = await ethers.getNamedSigners();
  const { deployer: deployerAddress } = await getNamedAccounts();

  const args: DeployArgs = [];

  await deployments.deploy(NAME, {
    // This will create a deployment called 'Market'. By default it will look for an artifact with the same name. The 'contract' option allows you to use a different artifact.
    from: deployerAddress, // Deployer will be performing the deployment transaction.
    args, // Arguments to thecontract's constructor.
    log: true, // Display the address and gas used in the console (not when run in test though).
  });
};

func.tags = ['ListingGateway']; // This sets up a tag so you can execute the script on its own (and its dependencies).
// func.dependencies = ['ListingData'];

export default func;
