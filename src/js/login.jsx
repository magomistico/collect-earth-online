import { useState } from "react";
import ReactDOM from "react-dom";
import { useSetAtom, useAtomValue } from "jotai";
import { stateAtom } from "./utils/constants";
import { NavigationBar, BreadCrumbs } from "./components/PageComponents";
import Modal from "./components/Modal";

export function Login ({returnurl}) {
  const [loginAtom, setLoginAtom] = useState ({email: "",
                                               password: "",
                                               modal: null});
  const setAppState = useSetAtom (stateAtom);
  const requestLogin = () => {
    fetch("/login", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(loginAtom),
    })
      .then((response) => Promise.all([response.ok, response.json()]))
      .then((data) => {
        if (data[0] && data[1] === "") {
          window.location = returnurl === "" ? "/home" : returnurl;
        } else {
          setAppState ((s) => ({... s, userEmail: loginAtom.email}));
          setLoginAtom ((s) => ({...s , modal: {alert: {alertType: "Login Error", alertMessage: data[1]}}}));
        }
      })
      .catch((err) => console.log(err));
  };

  return (
      <div className="d-flex justify-content-center">
        {loginAtom.modal?.alert &&
         <Modal title={loginAtom.modal.alert.alertType}
                onClose={()=>{setLoginAtom ((s) => ({...s, modal: null}));}}>
           {loginAtom.modal.alert.alertMessage}
         </Modal>}

        <div className="card card-darkgreen" style={{ minWidth: "380px", marginTop: "24px" }}>
          <div className="card-header card-header-lightgreen">Iniciar sesión en tu cuenta</div>
          <div className="card-body">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                requestLogin();
              }}
            >
              <div className="form-group">
                <label htmlFor="email">Correo electrónico</label>
                <input
                  className="form-control"
                  id="email"
                  onChange={(e) => {
                    e.persist ();
                    setLoginAtom((s) => ({...s,  email: e.target.value }));
		  }}
                  placeholder="admin@inab.gob.gt"
                  type="email"
                  value={loginAtom.email}
                />
              </div>
              <div className="form-group">
                <label htmlFor="password">Contraseña</label>
                <input
                  className="form-control"
                  id="password"
                  onChange={(e) =>{
                    e.persist();		    
		    setLoginAtom ((s) => ({...s,  password: e.target.value }));
		  }}
                  placeholder="Contraseña"
                  type="password"
                  value={loginAtom.password}
                />
              </div>
              <div className="d-flex justify-content-end align-items-center">
                <button className="btn btn-darkgreen" type="submit">
                  Iniciar Sesión
                </button>
              </div>
            </form>
          </div>
          <div className="card-header-lightgreen card-footer">¿Nuevo usuario en INAB · SIG?</div>
          <div className="card-body">
            <div className="d-flex justify-content-end">
              <input
                className="btn btn-darkgreen"
                name="register"
                onClick={() => window.location.assign("/register")}
                type="button"
                value="Registrarse"
              />
            </div>
          </div>
        </div>
      </div>
    );  
};



export function pageInit(params, session) {
  ReactDOM.render(
    <NavigationBar userId={session.userId} userName={session.userName} version={session.versionDeployed}>
      <BreadCrumbs
        crumbs={[
          {display: "Iniciar Sesión",
           id:"login"}]}
      />
      <Login returnurl={params.returnurl || ""} />
    </NavigationBar>,
    document.getElementById("app")
  );
}
