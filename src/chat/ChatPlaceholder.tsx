import React from "react";
import Link from "next/link";
import { BsGithub } from "react-icons/bs";

type Props = {};

export default function ChatPlaceholder({}: Props) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="max-w-md p-4 text-center text-primary">
        <h1 className="text-4xl font-medium">EduChat</h1>
        <p className="mt-4 text-lg">
          Claude et O1 pour l'enseignement
        </p>
        <h1>&nbsp;</h1>
        <p className="text-4xl text-center hover:text-primary flex items-center justify-center gap-1">
          <Link href="https://github.com/4nd4ny/EduChat/" target="_blank">
            <BsGithub/>
          </Link>
        </p>
        <h1>&nbsp;</h1>
        <h1>&nbsp;</h1>
        <center>
          <img className="items-center justify-center" src="https://chamblandes.education/logo.png" alt="Gymnase de Chamblandes"/>
        </center>
        <h1>&nbsp;</h1>
        <h1>&nbsp;</h1>
        <p className="text-xs text-center hover:text-primary items-center justify-center gap-1">
          Pour une réflexion plus approfondie<br/>cliquez sur "Regénérer".
        </p>
      </div>
    </div>
  );
}
