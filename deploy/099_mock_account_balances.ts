import {
  DaiToken,
  InfiToken,
  UChildDAI,
  UChildINFI,
  UChildUSDC,
  UChildUSDT,
  UsdcToken,
  UsdtToken,
} from '@project/contracts/typechain';
import {
  BigNumber,
  constants,
  Contract,
  ContractTransaction,
  Signer,
} from 'ethers';
import { HardhatRuntimeEnvironment } from 'hardhat/types'; // This adds the type from hardhat runtime environment.
import { DeployFunction } from 'hardhat-deploy/types'; // This adds the type that a deploy function is expected to fulfill.

const { Zero } = constants;

const FREE_GAS_OPTS = {
  gasPrice: 0,
};

type BalanceOfContract = Pick<DaiToken, 'balanceOf'>;
type Provider = Contract['provider'];

function makeFetchBalances(provider: Provider, contracts: BalanceOfContract[]) {
  // Function: Fetch balances for a list of addresses
  return async (addresses: string[]) => {
    const balanceEntriesPromises = addresses.map(async (addr) => {
      const balancePromises = [
        provider.getBalance(addr),
        ...contracts.map((contract) => contract.balanceOf(addr)),
      ];

      const balances = await Promise.all(balancePromises);

      // return entry suitable for Object.fromEntries()
      return [addr, balances] as const;
    });

    const balanceEntries = await Promise.all(balanceEntriesPromises);

    return Object.fromEntries(balanceEntries);
  };
}

async function getContract<T extends Contract>(
  {
    ethers,
    deployments,
  }: Pick<HardhatRuntimeEnvironment, 'ethers' | 'deployments'>,
  name: string,
  signer?: string | Signer
): Promise<T> {
  const proxy1 =
    (await deployments.getOrNull(`UChildERC20Proxy${name}`)) ||
    (await deployments.getOrNull(`UChildERC20Proxy${name}Dummy`));

  const proxy2 = await deployments.getOrNull(`FiatTokenProxy${name}`);

  if (proxy1) {
    return (await ethers.getContract<T>(`UChild${name}`, signer)).attach(
      proxy1.address
    ) as T;
  } else if (proxy2) {
    return (await ethers.getContract<T>(`FiatToken${name}`, signer)).attach(
      proxy2.address
    ) as T;
  } else {
    return ethers.getContract<T>(name, signer);
  }
}

function max(a: BigNumber, b: BigNumber): BigNumber {
  return a.gt(b) ? a : b;
}

const func: DeployFunction = async function ({
  ethers,
  network,
  deployments,
  getNamedAccounts,
}: HardhatRuntimeEnvironment) {
  if (!network.tags.test) {
    console.warn(
      `SKIP: not distributing balance on non-test network "${network.name}" with tags:`,
      network.tags
    );
    return;
  }

  // Fetch the receiving accounts. These can be configured in hardhat.config.ts under namedAccounts.
  const {
    funder1: r1,
    funder2: r2,
    holder1: r3,
    holder2: r4,
  } = await getNamedAccounts();

  // These receivers have not enough funds
  const receivers = [r1, r2, r3, r4];

  // Fetch the sender accounts. These can be configured in hardhat.config.ts under namedAccounts.
  const {
    childChainManager,

    minterINFI,
    minterDAI,
    minterUSDC,
    minterUSDT,

    holderINFI,
    holderDAI,
    holderUSDC,
    holderUSDT,
  } = await ethers.getNamedSigners();

  // These senders can deposit or mint
  const senders = [
    childChainManager?.address,

    minterINFI?.address,
    minterDAI?.address,
    minterUSDC?.address,
    minterUSDT?.address,

    holderINFI?.address,
    holderDAI?.address,
    holderUSDC?.address,
    holderUSDT?.address,
  ].filter((address) => !!address);

  // Impersonate senders for `hardhat node`
  const impersonatePromises = senders.map((fromAddress) =>
    network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [fromAddress],
    })
  );
  await Promise.all(impersonatePromises);

  // Get external contracts
  const hre = { ethers, deployments };
  const usdtToken = await getContract<UsdtToken | UChildUSDT>(hre, 'USDT');
  const usdcToken = await getContract<UsdcToken | UChildUSDC>(hre, 'USDC');
  const daiToken = await getContract<DaiToken | UChildDAI>(hre, 'DAI');
  const infiToken = await getContract<InfiToken | UChildINFI>(hre, 'INFI');

  const fetchBalances = makeFetchBalances(ethers.provider, [
    usdtToken,
    usdcToken,
    daiToken,
    infiToken,
  ]);

  // Fetch decimals
  console.debug('Fetching token decimals...');
  const decimalsPromises: Promise<BigNumber | number>[] = [
    usdtToken.decimals(),
    usdcToken.decimals(),
    daiToken.decimals(),
    infiToken.decimals(),
  ];
  const [
    usdtTokenDecimals,
    usdcTokenDecimals,
    daiTokenDecimals,
    infiTokenDecimals,
  ] = await Promise.all(decimalsPromises);

  // Amounts to deposit/mint/transfer
  const usdtTokenAmount = ethers.utils.parseUnits('1000000', usdtTokenDecimals);
  const usdcTokenAmount = ethers.utils.parseUnits('1000000', usdcTokenDecimals);
  const daiTokenAmount = ethers.utils.parseUnits('1000000', daiTokenDecimals);
  const infiTokenAmount = ethers.utils.parseUnits('1000000', infiTokenDecimals);

  // Fetch original receiver balances
  console.debug('Fetching balances before...');
  const receiverBalancesBefore = await fetchBalances(receivers);

  // Deposit/mint/transfer to receivers
  const txPromises = receivers.reduce<Promise<ContractTransaction>[]>(
    (acc, toAddress) => {
      const [
        _gasBalance,
        usdtBalance,
        usdcBalance,
        daiBalance,
        infiBalance,
      ] = receiverBalancesBefore[toAddress];

      const usdtDiffAmount = max(Zero, usdtTokenAmount.sub(usdtBalance));
      const usdcDiffAmount = max(Zero, usdcTokenAmount.sub(usdcBalance));
      const daiDiffAmount = max(Zero, daiTokenAmount.sub(daiBalance));
      const infiDiffAmount = max(Zero, infiTokenAmount.sub(infiBalance));

      if (typeof (usdtToken as UChildUSDT).deposit === 'function') {
        acc.push(
          (usdtToken as UChildUSDT)
            .connect(childChainManager)
            .deposit(
              toAddress,
              ethers.utils.defaultAbiCoder.encode(
                ['uint256'],
                [usdtDiffAmount]
              ),
              FREE_GAS_OPTS
            )
        );
      } else if (
        typeof (usdtToken as UsdtToken).issue === 'function' &&
        minterUSDT
      ) {
        const usdtTokenWithSigner = (usdtToken as UsdtToken).connect(
          minterUSDT
        );
        acc.push(
          usdtTokenWithSigner
            .issue(usdtDiffAmount, FREE_GAS_OPTS)
            .then((tx) => tx.wait())
            .then(() =>
              usdtTokenWithSigner.transfer(
                toAddress,
                usdtDiffAmount,
                FREE_GAS_OPTS
              )
            )
        );
      } else {
        acc.push(
          usdtToken.connect(holderUSDT).transfer(toAddress, usdtDiffAmount)
        );
      }

      if (typeof (usdcToken as UChildUSDC).deposit === 'function') {
        acc.push(
          (usdcToken as UChildUSDC)
            .connect(childChainManager)
            .deposit(
              toAddress,
              ethers.utils.defaultAbiCoder.encode(
                ['uint256'],
                [usdcDiffAmount]
              ),
              FREE_GAS_OPTS
            )
        );
      } else if (
        typeof (usdcToken as UsdcToken).mint === 'function' &&
        minterUSDC
      ) {
        acc.push(
          (usdcToken as UsdcToken)
            .connect(minterUSDC)
            .mint(toAddress, usdcDiffAmount, FREE_GAS_OPTS)
        );
      } else {
        acc.push(
          usdcToken
            .connect(holderUSDC)
            .transfer(toAddress, usdcDiffAmount, FREE_GAS_OPTS)
        );
      }

      if (typeof (daiToken as UChildDAI).deposit === 'function') {
        acc.push(
          (daiToken as UChildDAI)
            .connect(childChainManager)
            .deposit(
              toAddress,
              ethers.utils.defaultAbiCoder.encode(['uint256'], [daiDiffAmount]),
              FREE_GAS_OPTS
            )
        );
      } else if (
        typeof (daiToken as DaiToken).mint === 'function' &&
        minterDAI
      ) {
        acc.push(
          (daiToken as DaiToken)
            .connect(minterDAI)
            .mint(toAddress, daiDiffAmount, FREE_GAS_OPTS)
        );
      } else {
        acc.push(
          daiToken
            .connect(holderDAI)
            .transfer(toAddress, daiDiffAmount, FREE_GAS_OPTS)
        );
      }

      if (typeof (infiToken as UChildINFI).deposit === 'function') {
        acc.push(
          (infiToken as UChildINFI)
            .connect(childChainManager)
            .deposit(
              toAddress,
              ethers.utils.defaultAbiCoder.encode(
                ['uint256'],
                [infiDiffAmount]
              ),
              FREE_GAS_OPTS
            )
        );
      } else if (
        typeof (infiToken as InfiToken).mint === 'function' &&
        minterINFI
      ) {
        acc.push(
          (infiToken as InfiToken)
            .connect(minterINFI)
            .mint(toAddress, infiDiffAmount, FREE_GAS_OPTS)
        );
      } else {
        acc.push(
          infiToken
            .connect(holderINFI)
            .transfer(toAddress, infiDiffAmount, FREE_GAS_OPTS)
        );
      }

      return acc;
    },
    []
  );

  console.debug('Deposit/minting...');
  const txs = await Promise.all(txPromises);
  console.debug('Waiting on tx confirmation...');
  await Promise.all(txs.map((tx) => tx.wait()));

  // Fetch new receiver balances
  console.debug('Fetching balances after...');
  const receiverBalancesAfter = await fetchBalances(receivers);

  // Format receiver balances
  Object.entries(receiverBalancesAfter).forEach(([address, balancesAfter]) => {
    const [
      gasBalance,
      usdtBalance,
      usdcBalance,
      daiBalance,
      infiBalance,
    ] = balancesAfter;

    console.debug(`Balances of ${address}:\n`, {
      GAS: ethers.utils.formatUnits(gasBalance),
      USDT: ethers.utils.formatUnits(usdtBalance, usdtTokenDecimals),
      USDC: ethers.utils.formatUnits(usdcBalance, usdcTokenDecimals),
      DAI: ethers.utils.formatUnits(daiBalance, daiTokenDecimals),
      INFI: ethers.utils.formatUnits(infiBalance, infiTokenDecimals),
    });
  });
};

func.tags = ['MockBalances']; // This sets up a tag so you can execute the script on its own (and its dependencies).
// func.dependencies = [];

export default func;
