# My Pi agent config

The contents of my `~/.pi` directory used by the [Pi coding agent](https://github.com/davidondrej/pi-agent)

## Contents

- This repo contains everything in my `~/.pi` directory with the omission of `~/.pi/agent/auth.json` and `~/.pi/agent/sessions` for obvious reasons. Might also leave out some WIP stuff
- There's really only one thing worth your notice: If you use mistral, you might find `./agent/extensions/websearch.ts` interesting. It calls the mistral agent API (beta) with access to the `web_search` tool. So if you use devstral and have a mistral API key, you get a web search subagent too without having to setup something separately. Not sure what mistral uses under the hood, but all the big players in the web API space are American like Exa, Tavily and Firecrawl. Zyte has web scraping, but afaik doesn't come with search. 
