import path from 'path';

import fs from 'fs-extra';

export function addUpgradeToFunctionToABI(
  deploymentPath: string,
  contractName: string,
  networkName: string
): void {
  const proxyFilePath = path.join(
    deploymentPath,
    networkName,
    `${contractName}_Proxy.json`
  );

  let upgradeToAbi;
  let contractProxy;

  try {
    contractProxy = JSON.parse(fs.readFileSync(proxyFilePath, 'utf8'));
    upgradeToAbi = contractProxy.abi.filter(
      (data: { name: string }) => data.name === 'upgradeTo'
    );
  } catch (error) {
    return;
  }

  if (upgradeToAbi.length === 0) {
    contractProxy.abi.push({
      inputs: [
        {
          internalType: 'address',
          name: 'newImplementation',
          type: 'address',
        },
      ],
      name: 'upgradeTo',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    });

    fs.writeFileSync(proxyFilePath, JSON.stringify(contractProxy, null, 2));
  }
}
