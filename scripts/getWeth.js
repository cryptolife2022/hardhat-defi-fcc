const { ethers, getNamedAccounts } = require("hardhat")

const AMOUNT = ethers.utils.parseEther("0.02")
// https://etherscan.io/token/0x6b175474e89094c44da98b954eedeac495271d0f
const daiTokenAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F"
const wethTokenAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"

async function getWeth() {
    const { deployer } = await getNamedAccounts()
    // call the "desposit" function on the weth contract
    // abi, contract address
    // You can do this by FORKING the Mainnet
    // Mainnet : 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2

    const iWeth = await ethers.getContractAt("IWeth", wethTokenAddress, deployer)

    const tx = await iWeth.deposit({ value: AMOUNT })
    tx.wait(1)
    const wethBalance = await iWeth.balanceOf(deployer)
    console.log(`Got ${ethers.utils.formatUnits(wethBalance.toString(), "ether")} WETH`)
}

module.exports = { getWeth, AMOUNT }
