import React from "react";
import ReactDOM from "react-dom";
import { AuthScreen } from "./login";

export function pageInit(params) {
  ReactDOM.render(
    <AuthScreen returnurl={params.returnurl || ""} initialTab="register" />,
    document.getElementById("app")
  );
}
