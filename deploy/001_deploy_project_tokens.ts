import {
  ERC1967Proxy__factory,
  UChildPowerful,
} from '@project/contracts/typechain';
import { HardhatRuntimeEnvironment } from 'hardhat/types'; // This adds the type from hardhat runtime environment.
import { DeployFunction, DeployResult } from 'hardhat-deploy/types'; // This adds the type that a deploy function is expected to fulfill.

type OmitLast<T extends unknown[]> = T extends [...infer Head, unknown?]
  ? Head
  : never;

type ProxyDeployArgs = OmitLast<Parameters<ERC1967Proxy__factory['deploy']>>;

type InitializeParams = OmitLast<Parameters<UChildPowerful['initialize']>>;

const LOGIC_NAME = 'UChildINFI';
const NAME = 'UChildERC20ProxyINFI';
const DUMMY_NAME = 'UChildERC20ProxyINFIDummy';

const func: DeployFunction = async function ({
  ethers,
  network,
  deployments,
  getNamedAccounts,
}: HardhatRuntimeEnvironment) {
  console.debug('Network:', {
    name: network.name,
    live: network.live,
    tags: network.tags,
  });

  if (network.live && !network.tags.child) {
    console.warn(
      `SKIP: not running deployment on non-child live network "${network.name}" with tags:`,
      network.tags
    );
    return;
  }

  const {
    deployer: deployerAddress,
    coinSigner: coinSignerAddress,
    trustedForwarder,
    childChainManager,
  } = await getNamedAccounts();

  const name = '(PoS) INFI';
  const symbol = 'INFI';
  const cap = '120000000000000000000000000';

  // Deploy logic
  let logicDeployed = network.live && (await deployments.getOrNull(LOGIC_NAME));
  if (!logicDeployed) {
    logicDeployed = await deployments.deploy(LOGIC_NAME, {
      contract: 'UChildPowerful',
      from: deployerAddress, // Deployer will be performing the deployment transaction.
      args: [], // Arguments to the contract's constructor.
      log: true, // Display the address and gas used in the console (not when run in test though).
    });
  }

  const contractImpl = await ethers.getContract<UChildPowerful>(LOGIC_NAME);

  if (childChainManager) {
    const initArgs: InitializeParams = [
      name,
      symbol,
      cap,
      trustedForwarder,
      childChainManager,
    ];

    const proxyDeployArgs: ProxyDeployArgs = [
      contractImpl.address,
      contractImpl.interface.encodeFunctionData('initialize', initArgs),
    ];

    // Deploy real child
    const childDeployed = network.live && (await deployments.getOrNull(NAME));
    if (!childDeployed) {
      await deployments.deploy(NAME, {
        contract: 'UChildERC20Proxy',
        from: deployerAddress, // Deployer will be performing the deployment transaction.
        args: proxyDeployArgs, // Arguments to the contract's constructor.
        log: true, // Display the address and gas used in the console (not when run in test though).
      });
    } else if ((logicDeployed as DeployResult)?.newlyDeployed) {
      const deployer = await ethers.getNamedSigner('deployer');

      console.debug(
        `Upgrading ${NAME} proxy:`,
        `${childDeployed.address} -> ${contractImpl.address}`
      );

      await contractImpl
        .attach(childDeployed.address)
        .connect(deployer)
        .upgradeTo(contractImpl.address);

      console.debug(
        `${NAME} proxy upgraded:`,
        `${childDeployed.address} -> ${contractImpl.address}`
      );
    }
  }

  const initArgs: InitializeParams = [
    name,
    symbol,
    cap,
    trustedForwarder,
    coinSignerAddress || deployerAddress,
  ];

  const proxyDeployArgs: ProxyDeployArgs = [
    contractImpl.address,
    contractImpl.interface.encodeFunctionData('initialize', initArgs),
  ];

  // Deploy dummy child
  let dummyChildDeployed =
    network.live && (await deployments.getOrNull(DUMMY_NAME));
  if (!dummyChildDeployed) {
    dummyChildDeployed = await deployments.deploy(DUMMY_NAME, {
      contract: 'UChildERC20Proxy',
      from: deployerAddress, // Deployer will be performing the deployment transaction.
      args: proxyDeployArgs, // Arguments to the contract's constructor.
      log: true, // Display the address and gas used in the console (not when run in test though).
    });
  } else if ((logicDeployed as DeployResult)?.newlyDeployed) {
    const deployer = await ethers.getNamedSigner('deployer');

    console.debug(
      `Upgrading ${DUMMY_NAME} proxy:`,
      `${dummyChildDeployed.address} -> ${contractImpl.address}`
    );

    await contractImpl
      .attach(dummyChildDeployed.address)
      .connect(deployer)
      .upgradeTo(contractImpl.address);

    console.debug(
      `${DUMMY_NAME} proxy upgraded:`,
      `${dummyChildDeployed.address} -> ${contractImpl.address}`
    );
  }

  if ((dummyChildDeployed as DeployResult)?.newlyDeployed) {
    const contract = contractImpl.attach(dummyChildDeployed.address);

    const deployer = await ethers.getNamedSigner('deployer');
    const { coinSigner, devWallet } = await ethers.getNamedSigners();

    // Perform dummy deposit
    const decimals = await contract.decimals();
    const amount = ethers.utils.parseUnits('1000000', decimals);
    const depositData = ethers.utils.defaultAbiCoder.encode(
      ['uint256'],
      [amount]
    );
    await contract
      .connect(coinSigner || deployer)
      .deposit(devWallet ? devWallet.address : deployer.address, depositData);
  }
};

func.tags = ['INFI']; // This sets up a tag so you can execute the script on its own (and its dependencies).

export default func;
