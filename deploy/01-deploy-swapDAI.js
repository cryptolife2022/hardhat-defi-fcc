// import
// main function
// calling of main function

// function deployFunc(hre) {
//     console.log("Hi!")
// }

// module.exports.default = deployFunc

// module.exports = async(hre) => {
// // hre.getNamedAccounts
// // hre.deployments
// const { getNamedAccounts, deployments } = hre
// }

const { network } = require("hardhat")
const {
    networkConfig,
    developmentChains,
    VERIFICATION_BLOCK_CONFIRMATIONS,
} = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId

    const waitBlockConfirmations = developmentChains.includes(network.name)
        ? 1
        : VERIFICATION_BLOCK_CONFIRMATIONS

    const accounts = await ethers.getSigners()
    const signer = accounts[0]
    const swapRouterAddress = "0xE592427A0AEce92De3Edee1F18E0157C05861564"

    log(`Creating swapRouterContract at ${swapRouterAddress}`)

    // Programmatically adding a consumer for the vrfCoordinatorV2Mock
    if (developmentChains.includes(network.name)) {
    }

    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        // verify
        log("Verifying ...")
        await verify(swapDAI.address, args)
    }

    log("--------------------------------------------------------")
}

module.exports.tags = ["all", "swapDAI"]
