# EduChat

This project is based on the [GPT-4 Playground](https://github.com/Nashex/gpt4-playground) project by [Nashex](https://github.com/Nashex).

## Overview

EduChat is a text-only multi-provider chat for educational institutions. It offers access to current language models while keeping the choice of provider, model, reasoning level, and API-key mode explicit.

## Key Features

- Easy server installation
- Access to Claude
- Access to ChatGPT

## Development Notes

This is my second React/Next.js/TypeScript/Flex project. Thanks to ChatGPT, I was able to develop this quickly in a learning-by-doing approach.

**Note:** As a full-time teacher at Chamblandes's gymnasium in Switzerland, I have limited time for maintaining this project, making improvements, or fixing bugs.

## Installation

To install this project, create a `.env` file in the root folder of the project (same folder as `src`). Add the keys that the developer manages on the server; users can alternatively provide their own key in the interface.

```dotenv
SECRET_OPENAI_API_KEY=
SECRET_ANTHROPIC_API_KEY=
SECRET_GEMINI_API_KEY=
SECRET_OPENROUTER_API_KEY=
SECRET_XAI_API_KEY=
SECRET_MISTRAL_API_KEY=
```

Personal keys remain only in the browser session memory and are not stored by the application. Never expose developer-managed keys with a `NEXT_PUBLIC_` prefix.

## Running Locally

To run this project locally, you will need to have [Node.js](https://nodejs.org/en/) installed. Once you have Node.js installed, clone this repository and run the following commands:

```bash
yarn install
yarn dev
```

This will start a local server on port 3000. You can then navigate to `localhost:3000` to view the project. I have personally made visible server configuration information with two links in the `rpdg.tsx` page showing the actions taken to be GDPR compliant. You can simply remove these links at first, if you just want to test the site.
