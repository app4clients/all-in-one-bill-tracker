package com.app4clients.allinonebilltracker.billing

object PremiumAccessController {
    const val FREE_ITEM_LIMIT = 10

    fun canCreateNewItem(itemCount: Int, premiumActive: Boolean): Boolean {
        return premiumActive || itemCount < FREE_ITEM_LIMIT
    }

    fun canUseBackup(premiumActive: Boolean): Boolean = premiumActive

    fun canUseRestore(premiumActive: Boolean): Boolean = premiumActive

    fun canUseBudgetGuard(premiumActive: Boolean): Boolean = premiumActive
}
