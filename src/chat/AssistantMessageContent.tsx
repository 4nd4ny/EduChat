import React from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw"; 
import remarkGfm from 'remark-gfm'; 
import remarkBreaks from "remark-breaks"; 
import rangeParser from "parse-numeric-range";

import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import tsx from "react-syntax-highlighter/dist/cjs/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/cjs/languages/prism/typescript";
import scss from "react-syntax-highlighter/dist/cjs/languages/prism/scss";
import bash from "react-syntax-highlighter/dist/cjs/languages/prism/bash";
import markdown from "react-syntax-highlighter/dist/cjs/languages/prism/markdown";
import python from "react-syntax-highlighter/dist/cjs/languages/prism/python";
import cpp from "react-syntax-highlighter/dist/cjs/languages/prism/cpp";
import json from "react-syntax-highlighter/dist/cjs/languages/prism/json";
import 'katex/dist/katex.min.css'; // Importer les styles KaTeX

SyntaxHighlighter.registerLanguage("tsx", tsx);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("scss", scss);
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("markdown", markdown);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("cpp", cpp);
SyntaxHighlighter.registerLanguage("json", json);

const syntaxTheme = oneDark;

type Props = {
  content: string;
};

export default function AssistantMessageContent({ content, ...props }: Props) {

  // Fonction de transformation LaTeX
  const latex_transformer = (content: string): string  => {
    return content
      .replace(/\\\[/g, '$$') // Remplace \[ par $$
      .replace(/\\\]/g, '$$') // Remplace \] par $$
      .replace(/\\\(/g, '$')  // Remplace \( par $
      .replace(/\\\)/g, '$')  // Remplace \) par $
      .replace(/~~(.*?)~~/g, '<del>$1</del>') // Remplace ~~texte~~ par <del>texte</del>
      .replace(/\\begin\{equation\}/g, '$$') // Remplace \begin{equation} par $$
      .replace(/\\end\{equation\}/g, '$$');  // Remplace \end{equation} par $$
      //.replace(/^.*\|.*\|.*$/gm, line => line.replace(/ /g, '&nbsp;')); // Remplace les espaces par &nbsp; pour les lignes avec au moins deux barres verticales

    };
  
  const transformedContent = latex_transformer(content);
  
  
  const MarkdownComponents: any = {
 
    // Custom renderer for <thinking> tag
    thinking: ({ children, ...props }: any) => {
      return (
        <>
          <h2 style={{ color: 'lightblue' }}>Thinking...</h2>
          {children}
        </>
      );
    },

    // Custom renderer for <thinking> tag
    encouragement: ({ children, ...props }: any) => {
      return (
        <>
        <h2 style={{ color: 'lightblue' }}>Inducement...</h2>
        {children}
        </>
      );
    },

    p: ({ node, children }: any) => {
      const isListItem = node?.children[0]?.tagName === 'li';
      if (isListItem) {
        return <>{children}</>;
      }
      return <p>{children}</p>;
    },

    // Work around for not rending <em> and <strong> tags
    em: ({ node, inline, className, children, ...props }: any) => {
      return (
        <span className={className} {...props}>
          <i>{children}</i>
        </span>
      );
    },
    strong: ({ node, inline, className, children, ...props }: any) => {
      return (
        <span className={className} {...props}>
          <b>{children}</b>
        </span>
      );
    },

    pre: ({ node, inline, className, children, ...props }: any) => {
      return (
        <pre className={`m-0 ${className || ""}`} {...props}>
          {children}
        </pre>
      );
    },

    ul: ({ children, className, ...props }: any) => {
      return (
        <ul className={`text-primary list-disc list-inside ${className || ""}`} {...props}>
          {children}
        </ul>
      );
    },

    ol: ({ children, className, ...props }: any) => {
      return (
        <ol className={`text-primary list-decimal list-inside ${className || ""}`} {...props}>
          {children}
        </ol>
      );
    },
    
    li: ({ children, className, ...props }: any) => {
      return (
        <li className={`text-secondary ${className || ""}`} {...props}>
          {children}
        </li>
      );
    },

    a: ({ href, children, ...props }: any) => {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 underline"
          {...props}
        >
          {children}
        </a>
      );
    },

    h1: ({ children, className, ...props }: any) => <h1 className="text-primary" {...props}>{children}</h1>,
    h2: ({ children, className, ...props }: any) => <h2 className="text-primary" {...props}>{children}</h2>,
    h3: ({ children, className, ...props }: any) => <h3 className="text-primary" {...props}>{children}</h3>,
    h4: ({ children, className, ...props }: any) => <h4 className="text-primary" {...props}>{children}</h4>,
    h5: ({ children, className, ...props }: any) => <h5 className="text-primary" {...props}>{children}</h5>,
    h6: ({ children, className, ...props }: any) => <h6 className="text-primary" {...props}>{children}</h6>,
    table: ({ children, className, ...props }: any) => <table className="text-primary" {...props}>{children}</table>,
    th: ({ children, className, ...props }: any) => <th className="text-primary" {...props}>{children}</th>,
    td: ({ children, className, ...props }: any) => <td className="text-primary" {...props}>{children}</td>,   

    code({ node, inline, className, ...props }: any) {
      const hasLang = /language-(\w+)/.exec(className || "");
      const hasMeta = node?.data?.meta;

      const applyHighlights: object = (applyHighlights: number) => {
        if (hasMeta) {
          const RE = /{([\d,-]+)}/;
          const metadata = node.data.meta?.replace(/\s/g, "");
          const strlineNumbers = RE?.test(metadata)
            ? RE?.exec(metadata)?.[1]
            : "0";
          const highlightLines = rangeParser(strlineNumbers || "0");
          const highlight = highlightLines;
          const data: string = highlight.includes(applyHighlights)
            ? "highlight"
            : "";
          return { data };
        } else {
          return {};
        }
      };

      return hasLang ? (
        <SyntaxHighlighter
          style={syntaxTheme}
          language={hasLang[1]}
          PreTag="div"
          className="overflow-hidden rounded-md"
          showLineNumbers={true}
          wrapLines={hasMeta}
          useInlineStyles={true}
          lineProps={applyHighlights}
        >
          {props.children}
        </SyntaxHighlighter>
      ) : (
        <code className={className} {...props} />
      );
    },

    mathml: ({ node } : any) => (
      <div dangerouslySetInnerHTML={{ __html: node.outerHTML }} />
    ),

  };

  return ( 
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkBreaks, remarkGfm]}
        rehypePlugins={[rehypeKatex, rehypeRaw]}
        components={MarkdownComponents}
      >
        {transformedContent}
      </ReactMarkdown> 
  );
}