import React from 'react';
import type { AppProps } from "next/app";
import { AIProviderManager } from '../context/AIProviderManager';
import Layout from '../context/Layout'; 

import "@/utils/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <AIProviderManager>
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </AIProviderManager>
    </>
  );
}
