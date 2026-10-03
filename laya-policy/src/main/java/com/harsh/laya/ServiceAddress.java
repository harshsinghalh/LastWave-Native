package com.harsh.laya;

import java.net.URI;

/** Laya metadata always uses HTTPS, independently of the app's local casting transport. */
public final class ServiceAddress {
    private ServiceAddress() {}

    public static String normalize(String input) {
        String value = input == null ? "" : input.trim();
        if (!value.isBlank()) {
            URI address;
            try { address = URI.create(value); }
            catch (IllegalArgumentException invalid) { throw new IllegalArgumentException("Enter a valid HTTPS service address"); }
            if (!"https".equalsIgnoreCase(address.getScheme()) || address.getHost() == null
                    || address.getUserInfo() != null || address.getQuery() != null || address.getFragment() != null) {
                throw new IllegalArgumentException("Enter an HTTPS service address without credentials, query or fragment");
            }
        }
        return value.replaceAll("/+$", "");
    }
}
