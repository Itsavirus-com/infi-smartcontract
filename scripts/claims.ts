import {
  ClaimGateway,
  CollectiveClaimGateway,
} from '@project/contracts/typechain';
import { Contract, Signer } from 'ethers';
import { deployments, ethers, network } from 'hardhat';

import { getNowUnix } from '../test/unit/utils/calculationUtils';

async function getContract<T extends Contract>(
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

async function main() {
  await network.provider.send('evm_setNextBlockTimestamp', [getNowUnix()]);

  const claimGateway = await getContract<ClaimGateway>('ClaimGateway');
  const collectiveClaimGateway = await getContract<CollectiveClaimGateway>(
    'CollectiveClaimGateway'
  );
  const { holder1 } = await ethers.getNamedSigners();
  const dummyRoundId = '18446744073709555608';

  const coverId = 0;
  await claimGateway.connect(holder1).submitClaim(coverId, dummyRoundId);

  const requestId = 0;
  await collectiveClaimGateway
    .connect(holder1)
    .collectiveSubmitClaim(requestId, dummyRoundId);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
