package com.app4clients.allinonebilltracker; 


import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.amazon.device.iap.PurchasingListener;
import com.amazon.device.iap.PurchasingService;
import com.amazon.device.iap.model.Product;
import com.amazon.device.iap.model.ProductDataResponse;
import com.amazon.device.iap.model.PurchaseResponse;
import com.amazon.device.iap.model.PurchaseUpdatesResponse;
import com.amazon.device.iap.model.Receipt;
import com.amazon.device.iap.model.RequestId;
import com.amazon.device.iap.model.UserDataResponse;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

@CapacitorPlugin(name = "AmazonIap")
public class AmazonIapPlugin extends Plugin implements PurchasingListener {
    private static final String TAG = "AmazonIapPlugin";

    // requestId -> action type ("products" | "purchase" | "restore")
    private final Map<String, String> requestMap = new HashMap<>();

    @Override
    public void load() {
        super.load();
        PurchasingService.registerListener(getContext().getApplicationContext(), this);
        Log.d(TAG, "Amazon IAP listener registered");
    }

    @PluginMethod
    public void getProducts(PluginCall call) {
        JSArray skusArr = call.getArray("skus");
        if (skusArr == null || skusArr.length() == 0) {
            call.reject("skus array is required");
            return;
        }

        Set<String> skus = new HashSet<>();
        for (int i = 0; i < skusArr.length(); i++) {
            String sku = skusArr.optString(i, "");
            if (!sku.isEmpty()) skus.add(sku);
        }

        if (skus.isEmpty()) {
            call.reject("No valid sku provided");
            return;
        }

        RequestId requestId = PurchasingService.getProductData(skus);
        requestMap.put(requestId.toString(), "products");

        JSObject ret = new JSObject();
        ret.put("requestId", requestId.toString());
        call.resolve(ret);
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String sku = call.getString("sku");
        if (sku == null || sku.trim().isEmpty()) {
            call.reject("sku is required");
            return;
        }

        RequestId requestId = PurchasingService.purchase(sku.trim());
        requestMap.put(requestId.toString(), "purchase");

        JSObject ret = new JSObject();
        ret.put("requestId", requestId.toString());
        ret.put("status", "purchase_requested");
        call.resolve(ret);
    }

    @PluginMethod
    public void restorePurchases(PluginCall call) {
        RequestId requestId = PurchasingService.getPurchaseUpdates(true);
        requestMap.put(requestId.toString(), "restore");

        JSObject ret = new JSObject();
        ret.put("requestId", requestId.toString());
        ret.put("status", "restore_requested");
        call.resolve(ret);
    }

    @Override
    public void onUserDataResponse(UserDataResponse response) {
        JSObject event = new JSObject();
        event.put("requestId", response.getRequestId() != null ? response.getRequestId().toString() : "");
        event.put("status", response.getRequestStatus().toString());

        if (response.getUserData() != null) {
            event.put("userId", response.getUserData().getUserId());
            event.put("marketplace", response.getUserData().getMarketplace());
        }

        notifyListeners("userDataResponse", event);
    }

    @Override
    public void onProductDataResponse(ProductDataResponse response) {
        JSObject event = new JSObject();
        event.put("requestId", response.getRequestId().toString());
        event.put("status", response.getRequestStatus().toString());

        JSArray products = new JSArray();
        if (response.getProductData() != null) {
            for (Map.Entry<String, Product> entry : response.getProductData().entrySet()) {
                Product p = entry.getValue();
                JSObject item = new JSObject();
                item.put("sku", p.getSku());
                item.put("title", p.getTitle());
                item.put("description", p.getDescription());
                item.put("price", p.getPrice());
                item.put("productType", p.getProductType().toString());
                products.put(item);
            }
        }
        event.put("products", products);

        notifyListeners("productDataResponse", event);
    }

    @Override
    public void onPurchaseResponse(PurchaseResponse response) {
        JSObject event = new JSObject();
        event.put("requestId", response.getRequestId().toString());
        event.put("status", response.getRequestStatus().toString());

        if (response.getUserData() != null) {
            event.put("userId", response.getUserData().getUserId());
            event.put("marketplace", response.getUserData().getMarketplace());
        }

        Receipt receipt = response.getReceipt();
        if (receipt != null) {
            JSObject rec = new JSObject();
            rec.put("receiptId", receipt.getReceiptId());
            rec.put("sku", receipt.getSku());
            rec.put("productType", receipt.getProductType().toString());
            rec.put("purchaseDate", receipt.getPurchaseDate() != null ? receipt.getPurchaseDate().getTime() : null);
            rec.put("cancelDate", receipt.getCancelDate() != null ? receipt.getCancelDate().getTime() : null);
            event.put("receipt", rec);
        }

        notifyListeners("purchaseResponse", event);
    }

    @Override
    public void onPurchaseUpdatesResponse(PurchaseUpdatesResponse response) {
        JSObject event = new JSObject();
        event.put("requestId", response.getRequestId().toString());
        event.put("status", response.getRequestStatus().toString());
        event.put("hasMore", response.hasMore());

        JSArray receipts = new JSArray();
        if (response.getReceipts() != null) {
            for (Receipt r : response.getReceipts()) {
                JSObject rec = new JSObject();
                rec.put("receiptId", r.getReceiptId());
                rec.put("sku", r.getSku());
                rec.put("productType", r.getProductType().toString());
                rec.put("purchaseDate", r.getPurchaseDate() != null ? r.getPurchaseDate().getTime() : null);
                rec.put("cancelDate", r.getCancelDate() != null ? r.getCancelDate().getTime() : null);
                receipts.put(rec);
            }
        }

        event.put("receipts", receipts);

        if (response.getUserData() != null) {
            event.put("userId", response.getUserData().getUserId());
            event.put("marketplace", response.getUserData().getMarketplace());
        }

        notifyListeners("purchaseUpdatesResponse", event);
    }
}