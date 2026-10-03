package com.harsh.laya;

import org.junit.Test;
import static org.junit.Assert.*;

public class ServiceAddressTest {
    @Test public void httpsPrefixesAreNormalizedAndCanBeCleared() {
        assertEquals("https://laya.example.org/api", ServiceAddress.normalize(" https://laya.example.org/api/// "));
        assertEquals("", ServiceAddress.normalize("  "));
        assertEquals("", ServiceAddress.normalize(null));
    }

    @Test public void localCastingPermissionCannotMakeAMetadataAddressCleartext() {
        for (String input : new String[]{"http://192.168.1.2:8000", "http://localhost:8000", "//laya.example.org", "laya.example.org"}) {
            try { ServiceAddress.normalize(input); fail(input); }
            catch (IllegalArgumentException expected) { }
        }
    }

    @Test public void credentialsAndUnrelatedUrlPartsAreRejected() {
        for (String input : new String[]{"https://user:password@laya.example.org", "https://laya.example.org?key=secret",
                "https://laya.example.org#fragment", "https://", "https://invalid host"}) {
            try { ServiceAddress.normalize(input); fail(input); }
            catch (IllegalArgumentException expected) { }
        }
    }
}
