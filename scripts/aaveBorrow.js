const { getNamedAccounts, ethers } = require("hardhat")
const { getWeth, AMOUNT } = require("../scripts/getWeth")
/*
const {
    ChainId,
    Fetcher,
    WETH,
    Route,
    Trade,
    Token,
    TokenAmount,
    TradeType,
} = require("@uniswap/sdk")
const url = "http://127.0.0.1:8545"
const customHttpProvider = new ethers.providers.JsonRpcProvider(url)
const chainId = ChainId.MAINNET
*/
// https://etherscan.io/token/0x6b175474e89094c44da98b954eedeac495271d0f
const daiTokenAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F"
const wethTokenAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
const lendingPoolAddress = "0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5"
const daiEthPriceFeedAggregatorAddress = "0x773616E4d11A78F511299002da57A0a94577F1f4"

const swapRouterContractName =
    //"ISwapRouter", //V2
    "ISwapRouter02" //V3
const swapRouterAddress =
    //"0xE592427A0AEce92De3Edee1F18E0157C05861564", //V2
    "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45" //V3

async function main() {
    await getWeth()
    const daiPriceInWei = (await getDaiPrice()).toNumber()
    console.log("daiPriceInWei : ", daiPriceInWei)

    // First wallet address
    const { deployer } = await getNamedAccounts()
    const iDai = await ethers.getContractAt("IWeth", daiTokenAddress, deployer)
    const iWeth = await ethers.getContractAt("IWeth", wethTokenAddress, deployer)

    // abi, address
    // Deployed Pool contract
    // https://docs.aave.com/developers/v/2.0/deployed-contracts/deployed-contracts
    // 0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5
    const lendingPool = await getLendingPool(deployer)
    console.log(`LendingPool address ${lendingPool.address}`)

    console.log("===================")
    console.log("DEPOSITING WETH ...")
    console.log("===================")
    console.log(`Approving WETH WEI Deposit of ${AMOUNT} ...`)
    await approveErc20(iWeth, lendingPool.address, AMOUNT)
    console.log(`Depositing ${AMOUNT}  WETH WEI ...`)
    // referral code is discontinued ... set to 0
    //lendingPool.deposit(asset, amount, onBehalfOf, referralCode)
    await lendingPool.deposit(wethTokenAddress, AMOUNT, deployer, 0)
    console.log("Deposited!")

    console.log("==================")
    console.log("TIME TO BORROW ...")
    console.log("==================")
    let borrowedData = await getBorrowedUserData(lendingPool, deployer, iWeth, iDai)
    // borrow 95% of max safe limit
    const amountDaiToBorrowWei = ethers.utils.parseEther(
        (borrowedData.availableBorrowsETH.toString() * 0.95 * (1 / daiPriceInWei)).toString()
    )
    console.log(`You can borrow ${amountDaiToBorrowWei} DAI WEI`)

    await borrowDai(daiTokenAddress, lendingPool, amountDaiToBorrowWei, deployer)
    // totalCollateralETH increased because of APR interest rate
    borrowedData = await getBorrowedUserData(lendingPool, deployer, iWeth, iDai)

    console.log("=================")
    console.log("REPAYING LOAN ...")
    console.log("=================")
    await repay(iDai, amountDaiToBorrowWei, daiTokenAddress, lendingPool, deployer)
    // Tiny amount of totalDebtETH still left over because interest is accured
    // and you need to pay more than account for interest
    // https://app.uniswap.org/#/swap
    // Swap ETH for DAI to repay the debt
    borrowedData = await getBorrowedUserData(lendingPool, deployer, iWeth, iDai)

    const amountDaiAccruedToRepayWei = ethers.utils.parseEther(
        (borrowedData.totalDebtETH.toString() * 1 * (1 / daiPriceInWei)).toFixed(18).toString()
    )
    // Pay back upto 2x the amount
    const amountWethAccruedToRepayWei = (borrowedData.totalDebtETH.toString() * 2).toString()

    console.log(`You have accrued ${amountDaiAccruedToRepayWei} DAI WEI to Repay`)
    console.log(
        `You have accrued ${ethers.utils.formatUnits(
            amountDaiAccruedToRepayWei,
            "ether"
        )} DAI to Repay`
    )
    console.log(`You have accrued ${amountWethAccruedToRepayWei} WETH WEI to Repay (x2 required)`)
    console.log(
        `You have accrued ${ethers.utils.formatUnits(
            amountWethAccruedToRepayWei,
            "ether"
        )} WETH to Repay (x2 required)`
    )

    console.log("=============================")
    console.log("REPAYING ACCRUED INTEREST ...")
    console.log("=============================")
    console.log(`Withdrawing ${amountWethAccruedToRepayWei} WETH WEI from LendingPool to Wallet`)
    await withdrawWeth(lendingPool, amountWethAccruedToRepayWei, deployer, iWeth)

    console.log("--------- SWAPPING WETH for DAI ---------")
    await swapWethToDai(
        amountDaiAccruedToRepayWei,
        amountWethAccruedToRepayWei,
        iWeth,
        iDai,
        deployer
    )
    console.log("--------- SWAPPED WETH for DAI ---------")

    // Then repay the rest of the accrued lan
    await repay(iDai, amountDaiAccruedToRepayWei, daiTokenAddress, lendingPool, deployer)
    borrowedData = await getBorrowedUserData(lendingPool, deployer, iWeth, iDai)
}

async function getLendingPool(account) {
    const lendingPoolAddressesProvider = await ethers.getContractAt(
        "ILendingPoolAddressesProvider",
        lendingPoolAddress,
        account
    )

    const lendingPool = await lendingPoolAddressesProvider.getLendingPool()
    return await ethers.getContractAt("ILendingPool", lendingPool, account)
}

async function approveErc20(erc20Token, spenderAddress, amountToSpend) {
    const tx = await erc20Token.approve(spenderAddress, amountToSpend)
    const rc = await tx.wait(1)
    console.log("Approved ERC20!")
}

async function getBorrowedUserData(lendingPool, account, iWeth, iDai) {
    const borrowedData = await lendingPool.getUserAccountData(account)
    //console.log("BorrowedData : ", borrowedData)
    console.log(`You have ${borrowedData.totalCollateralETH} worth of ETH WEI deposited`)
    console.log(`You have ${borrowedData.totalDebtETH} worth of ETH WEI borrowed`)
    // still got about that 5% margin left
    console.log(`You can borrow ${borrowedData.availableBorrowsETH} worth of ETH WEI`)

    const wethBalance = await iWeth.balanceOf(account)
    console.log(`Got ${ethers.utils.formatUnits(wethBalance.toString(), "ether")} WETH in Wallet`)

    const daiBalance = await iDai.balanceOf(account)
    console.log(`Got ${ethers.utils.formatUnits(daiBalance.toString(), "ether")} DAI in Wallet`)

    return borrowedData
}

async function getDaiPrice() {
    // DAI/ETH pricefeed at
    // https://docs.chain.link/docs/ethereum-addresses/
    const daiEthPriceFeed = await ethers.getContractAt(
        "AggregatorV3Interface",
        daiEthPriceFeedAggregatorAddress
    )
    const roundData = await daiEthPriceFeed.latestRoundData()
    //console.log("The DAI/ETH roundData", roundData)
    return roundData[1]
}

async function borrowDai(daiAddress, lendingPool, amountDaiToBorrowWei, account) {
    //lendingPool.borrow( asset,  amount,  interestRateMode (1stable, 0 variable), 0,  onBehalfOf)
    const borrowTx = await lendingPool.borrow(daiAddress, amountDaiToBorrowWei, 1, 0, account)
    await borrowTx.wait(1)
    console.log("You've borrowed!")
}

async function withdrawWeth(lendingPool, amountWethToWithdrawWei, account, iWeth) {
    //lendingPool.borrow( asset,  amount,  interestRateMode (1stable, 0 variable), 0,  onBehalfOf)
    const withdrawTx = await lendingPool.withdraw(iWeth.address, amountWethToWithdrawWei, account)
    withdrawTx.wait(1)
    console.log("You've withdrawan!")
    const wethBalance = await iWeth.balanceOf(account)
    console.log(`Got ${ethers.utils.formatUnits(wethBalance.toString(), "ether")} WETH in Wallet`)
}

async function repay(ifAddress, amountDaiToBorrowWei, daiAddress, lendingPool, account) {
    //lendingPool.borrow( asset,  amount,  interestRateMode (1stable, 0 variable), 0,  onBehalfOf)
    console.log("Approving RePay ...")
    await approveErc20(ifAddress, lendingPool.address, amountDaiToBorrowWei) // repay DAI back into lendingPool
    const repayTx = await lendingPool.repay(daiAddress, amountDaiToBorrowWei, 1, account)
    await repayTx.wait(1)
    console.log("You've repayed!")
}

async function swapWethToDai(
    amountDaiAccruedToRepayWei,
    withdrawnWETHAmountWei,
    iWeth,
    iDai,
    account
) {
    /*
    const DAI = new Token(ChainId.MAINNET, daiTokenAddress, 18)
    const pair = await Fetcher.fetchPairData(DAI, WETH[DAI.chainId])
    const route = new Route([pair], WETH[DAI.chainId])
    const trade = new Trade(
        route,
        new TokenAmount(WETH[DAI.chainId], amountWethAccruedToRepayWei),
        TradeType.EXACT_INPUT
    )

    console.log("Mid Price WETH --> DAI:", route.midPrice.toSignificant(6))
    console.log("Mid Price DAI --> WETH:", route.midPrice.invert().toSignificant(6))
    console.log("-".repeat(45))
    console.log("Execution Price WETH --> DAI:", trade.executionPrice.toSignificant(6))
    console.log("Mid Price after trade WETH --> DAI:", trade.nextMidPrice.toSignificant(6))
    */

    const SwapDaiContract = await ethers.getContractFactory("SwapDAI")
    const swapRouterContract = await ethers.getContractAt(
        swapRouterContractName,
        swapRouterAddress,
        account
    )
    console.log(`SwapRouter created at ${swapRouterContract.address}`)
    const swapDai = await SwapDaiContract.deploy(swapRouterContract.address)
    await swapDai.deployed()
    console.log(`SwapDAI deployed at ${swapDai.address}`)

    console.log(withdrawnWETHAmountWei, " WETH WEI used to Swap for DAI: ")
    console.log("Approving Swapping from iWeth -> iDai ...")
    console.log(`Approve ${withdrawnWETHAmountWei} WETH WEI to SwapRouter`)
    await approveErc20(iWeth, swapRouterContract.address, withdrawnWETHAmountWei) //amountWethAccruedToRepayWei)
    console.log(`Approve ${withdrawnWETHAmountWei} WETH WEI to SwapDai`)
    await approveErc20(iWeth, swapDai.address, withdrawnWETHAmountWei) //amountWethAccruedToRepayWei)

    const swapTx = await swapDai.swapExactOutputSingle(
        amountDaiAccruedToRepayWei, // OUT
        //amountWethAccruedToRepayWei // IN
        withdrawnWETHAmountWei //IN
    )
    swapTx.wait(1)
    const wethBalance = await iWeth.balanceOf(account)
    console.log(`Got ${ethers.utils.formatUnits(wethBalance.toString(), "ether")} WETH in Wallet`)
    const daiBalance = await iDai.balanceOf(account)
    console.log(`Got ${ethers.utils.formatUnits(daiBalance.toString(), "ether")} DAI in Wallet`)
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
