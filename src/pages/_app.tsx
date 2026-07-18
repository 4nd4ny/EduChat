import React from 'react';
import type { AppProps } from "next/app";
import AnthropicProvider from '../context/AnthropicProvider';
import Layout from '../context/Layout'; 

import "@/utils/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <AnthropicProvider>
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </AnthropicProvider>
    </>
  );
}
