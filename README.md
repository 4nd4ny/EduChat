# EduChat

This project is based on [EduChat](https://github.com/4nd4ny/EduChat-4o), which itself is based on the [GPT-4 Playground](https://github.com/Nashex/gpt4-playground) project by [Nashex](https://github.com/Nashex).

## Overview

EduChat is designed for educational institutions aiming to provide their students with free access to the latest versions of Claude and O1 artificial intelligence models, in compliance with the GDPR. The installation on a server is accomplished easily using a few simple commands, enabling quick and efficient implementation of this educational tool.

## Key Features

- Easy server installation
- Access to Claude models by default
- Access to O1 when a refresh is done

## Differences from EduChat

The main difference from [EduChat](https://github.com/4nd4ny/EduChat-4o) is the mixture of Claude and O1, instead of using ChatGPT 4o and O1. Which mean, you need two API keys!

## Development Notes

This is my second React/Next.js/TypeScript/Flex project. Thanks to ChatGPT, I was able to develop this quickly in a learning-by-doing approach.

**Note:** As a full-time teacher at Chamblandes's gymnasium in Switzerland, I have limited time for maintaining this project, making improvements, or fixing bugs.

## Installation

To install this project, create a `.env` file in the root folder of the project (same folder as `src`), with API Key, encrypted password, allowed IPs and allowed hours, as provided in `(dot)env`.

## Running Locally

To run this project locally, you will need to have [Node.js](https://nodejs.org/en/) installed. Once you have Node.js installed, clone this repository and run the following commands:

```bash
yarn install
yarn dev
```

This will start a local server on port 3000. You can then navigate to `localhost:3000` to view the project. I have personally made visible server configuration information with two links in the `rpdg.tsx` page showing the actions taken to be GDPR compliant. You can simply remove these links at first, if you just want to test the site.
