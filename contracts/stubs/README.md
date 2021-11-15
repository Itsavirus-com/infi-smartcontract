### Why

The files in this folder helps `hardhat-react` plugin detect the right contract ABI, when deploying a contract/artifact under a different name/alias like so:

```typescript
await deployments.deploy('AbcToken', {
  contract: 'Token', // Contract name in solidity
});
```
