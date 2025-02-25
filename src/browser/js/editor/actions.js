import fetch from "isomorphic-unfetch";
import saveAs from "file-saver";
import Moment from "moment";
import web from "../web";
import history from "../history";
import * as alertActions from "../alert/actions";
import * as browserActions from "../browser/actions";
import * as actionsEditorTools from "../editorTools/actions";
import {
  isValidUISchema,
  isValidSchema,
  isValidConfig,
  pathSlice
} from "../utils";
import { getCurrentBucket } from "../buckets/selectors";

export const SET_SCHEMA_LIST = "editor/SET_SCHEMA_LIST";
export const SET_CONFIG_LIST = "editor/SET_CONFIG_LIST";
export const SET_UISCHEMA_LIST = "editor/SET_UISCHEMA_LIST";
export const RESET_SCHEMA_LIST = "editor/RESET_SCHEMA_LIST";
export const RESET_UISCHEMA_LIST = "editor/RESET_UISCHEMA_LIST";
export const RESET_CONFIG_LIST = "editor/RESET_CONFIG_LIST";
export const RESET_LOCAL_UISCHEMA_LIST = "editor/RESET_LOCAL_UISCHEMA_LIST";
export const RESET_LOCAL_SCHEMA_LIST = "editor/RESET_LOCAL_SCHEMA_LIST";
export const RESET_LOCAL_CONFIG_LIST = "editor/RESET_LOCAL_CONFIG_LIST";
export const SET_CONFIG_DATA = "editor/SET_CONFIG_DATA";
export const SET_UI_SCHEMA_DATA = "editor/SET_UI_SCHEMA_DATA";
export const SET_SCHEMA_DATA = "editor/SET_SCHEMA_DATA";
export const SET_UPDATED_CONFIG = "editor/SET_UPDATED_CONFIG";
export const RESET_SCHEMA_FILES = "editor/RESET_SCHEMA_FILES";
export const RESET_UPLOADED_SCHEMA_LIST = "editor/RESET_UPLOADED_SCHEMA_LIST";
export const SET_CONFIG_DATA_PRE_CHANGE = "editor/SET_CONFIG_DATA_PRE_CHANGE";
export const SET_UPDATED_FORM_DATA = "editor/SET_UPDATED_FORM_DATA";
export const SET_ACTIVE_NAV = "editor/SET_ACTIVE_NAV";
export const SET_UISCHEMA_SOURCE = "editor/SET_UISCHEMA_SOURCE";
export const SET_DEVICE_FILE_DATA = "editor/SET_DEVICE_FILE_DATA";
export const SET_PREV_DEVICE_FILE_DEVICE = "editor/SET_PREV_DEVICE_FILE_DEVICE";
export const SET_DEVICE_FILE_LAST_MODIFIED =
  "editor/SET_DEVICE_FILE_LAST_MODIFIED";

// Note: These need to be updated with future firmware revisions
const uiSchemaAry = [
  "uischema-00.07.json | Simple",
  "uischema-00.07.json | Advanced"
];

const schemaAry = [
  "schema-00.07.json | CANedge2",
  "schema-00.07.json | CANedge1",
  "schema-00.06.json | CANedge2",
  "schema-00.06.json | CANedge1",
  "schema-00.05.json | CANedge2",
  "schema-00.05.json | CANedge1"
];

const regexSchema = new RegExp(/^schema-\d{2}\.\d{2}\.json/, "g");
const regexSchemaPublic = new RegExp(
  /^schema-\d{2}\.\d{2}\.json \| CANedge(1|2)$/,
  "g"
);
const regexUISchemaPublic = new RegExp(
  /^uischema-\d{2}\.\d{2}\.json \| (Advanced|Simple)$/,
  "g"
);
const regexConfig = new RegExp(/^config-\d{2}\.\d{2}\.json/, "g");
const regexUiSchema = new RegExp(/^uischema-\d{2}\.\d{2}\.json/, "g");
const regexDeviceFile = new RegExp(/^device\.json/, "g");

// load the Simple/Advanced default UIschema in the online & offline editor
export const publicUiSchemaFiles = () => {
  return function(dispatch) {
    dispatch(loadUISchemaSimpleAdvanced())
  };
};

// load the relevant schema file when a user uploads a config file (based on revision)
export const publicSchemaFiles = selectedConfig => {
  return function(dispatch) {
    dispatch(resetSchemaFiles());

    if (selectedConfig) {
      const schemaAryFiltered = schemaAry.filter(e =>
        e.includes(selectedConfig.substr(7, 5))
      );

      const defaultSchema = schemaAryFiltered[0];

      if (defaultSchema) {
        const schemaPublic = require(`../../schema/${
          defaultSchema.split(" | ")[1]
        }/${defaultSchema.split(" ")[0]}`);

        dispatch(setSchemaFile(schemaAryFiltered));
        dispatch(setSchemaContent(schemaPublic));
      }
    }
  };
};

// load both a simple/advanced UIschema
export const loadUISchemaSimpleAdvanced = () => {
  return function(dispatch) {
    dispatch(resetUISchemaList());

      const defaultUiSchema = uiSchemaAry[0];

        const defaultUiSchemaContent = require(`../../schema/${
          defaultUiSchema.split(" | ")[1]
        }/${defaultUiSchema.split(" ")[0]}`);

        dispatch(setUISchemaFile(uiSchemaAry));
        dispatch(setUISchemaContent(defaultUiSchemaContent));
    
  };
};


// Below is triggered when clicking Configure in the sidebar - or refreshing the page
// It fetches the device specific object list and parses these to the UIschema fetcher below
export const fetchSchemaFiles = prefix => {
  return function(dispatch) {
    dispatch(resetFiles());
    return web
      .ListObjects({
        bucketName: prefix,
        prefix: "",
        marker: ""
      })
      .then(data => {
        let allObjects = [];
        allObjects = data.objects.map(object => object.name.split("/")[0]);
        dispatch(fetchUISchemaFiles(allObjects));

        const deviceFileName = allObjects.filter(str =>
          str.match(regexDeviceFile)
        );

        const deviceFileObject = data.objects.filter(
          p => p.name === "device.json"
        )[0];
        const deviceFileLastModified = deviceFileObject
          ? Moment(deviceFileObject.lastModified).format(
              "MMMM Do YYYY, h:mm:ss a"
            )
          : "";

        dispatch(fetchDeviceFileContent(deviceFileName[0], prefix));
        dispatch(setDeviceFileLastModified(deviceFileLastModified));
      })
      .catch(err => {
        if (web.LoggedIn()) {
          dispatch(
            alertActions.set({
              type: "danger",
              message: err.message,
              autoClear: true
            })
          );
        } else {
          history.push("/login");
        }
      });
  };
};

// below fetches content of device.json file
export const fetchDeviceFileContent = (fileName, device) => {
  return function(dispatch, getState) {
    if (fileName == "") {
      dispatch(setDeviceFileContent(null));
    } else {
      const { bucket, prefix } = pathSlice(history.location.pathname);
      const currentBucket = getCurrentBucket(getState());
      const expiry = 5 * 24 * 60 * 60 + 1 * 60 * 60 + 0 * 60;

      if (currentBucket && fileName) {
        return web
          .PresignedGet({
            bucket: currentBucket,
            object: fileName,
            expiry: expiry
          })
          .then(res => {
            fetch(res.url)
              .then(r => r.json())
              .then(data => {
                dispatch(setDeviceFileContent(data));
                dispatch(setPrevDeviceFileDevice(device));
              })
              .catch(e => {
                dispatch(setDeviceFileContent(null));
                dispatch(
                  alertActions.set({
                    type: "danger",
                    message: `Warning: The file ${fileName} is invalid and was not loaded`,
                    autoClear: true
                  })
                );
              });
          })
          .catch(err => {
            if (web.LoggedIn()) {
              dispatch(
                alertActions.set({
                  type: "danger",
                  message: err.message,
                  autoClear: true
                })
              );
            } else {
              history.push("/login");
            }
          });
      } else if (prefix) {
        dispatch(setDeviceFileContent(null));
      } else {
        dispatch(setDeviceFileContent(null));
      }
    }
  };
};

export const fetchDeviceFileIfNew = device => {
  return function(dispatch, getState) {
    if (
      getState().buckets.currentBucket == getState().editor.prevDeviceFileDevice
    ) {
      return;
    } else {
      dispatch(fetchDeviceFile(device));
    }
  };
};

export const fetchDeviceFile = device => {
  return function(dispatch) {
    dispatch(setDeviceFileContent(null));
    return web
      .ListObjects({
        bucketName: device,
        prefix: "",
        marker: ""
      })
      .then(data => {
        const deviceFileObject = data.objects.filter(
          p => p.name === "device.json"
        )[0];
        const deviceFileName = deviceFileObject ? deviceFileObject.name : null;
        const deviceFileLastModified = deviceFileObject
          ? Moment(deviceFileObject.lastModified).format(
              "MMMM Do YYYY, h:mm:ss a"
            )
          : "";

        if (deviceFileObject) {
          dispatch(fetchDeviceFileContent(deviceFileName, device));
          dispatch(setDeviceFileLastModified(deviceFileLastModified));
        } else {
          dispatch(
            alertActions.set({
              type: "info",
              message: `The device does not have an uploaded device.json file`,
              autoClear: true
            })
          );
        }
      })
      .catch(err => {
        if (web.LoggedIn()) {
          dispatch(
            alertActions.set({
              type: "danger",
              message: err.message,
              autoClear: true
            })
          );
        } else {
          history.push("/login");
        }
      });
  };
};

export const setDeviceFileContent = deviceFileContent => ({
  type: SET_DEVICE_FILE_DATA,
  deviceFileContent
});

export const setPrevDeviceFileDevice = prevDeviceFileDevice => ({
  type: SET_PREV_DEVICE_FILE_DEVICE,
  prevDeviceFileDevice
});

export const setDeviceFileLastModified = deviceFileLastModified => ({
  type: SET_DEVICE_FILE_LAST_MODIFIED,
  deviceFileLastModified
});

export const fetchUISchemaFiles = configObjects => {
  return function(dispatch) {
    return web
      .ListObjects({
        bucketName: "server",
        prefix: "",
        marker: ""
      })
      .then(data => {
        let allObjects = [];
        allObjects = data.objects.map(object => object.name.split("/")[0]);
        let UISchemaFiles = allObjects
          .filter(str => str.match(regexUiSchema))
          .sort()
          .reverse();

        if (UISchemaFiles.length > 0) {
          dispatch(setUiSchemaSource("server"));
          dispatch(setUISchemaFile(UISchemaFiles));
          dispatch(fetchUISchemaContent(UISchemaFiles[0]));
        } else {
          dispatch(setUiSchemaSource("public"));
          dispatch(publicUiSchemaFiles());
        }

        let schemaFiles = configObjects
          .filter(str => str.match(regexSchema))
          .sort()
          .reverse();
        let configSchema = configObjects
          .filter(str => str.match(regexConfig))
          .sort()
          .reverse();

        dispatch(setConfigFile(configSchema));
        dispatch(fetchConfigContent(configSchema[0]));

        dispatch(setSchemaFile(schemaFiles));
        dispatch(fetchSchemaContent(schemaFiles[0]));
      })
      .catch(err => {
        if (web.LoggedIn()) {
          dispatch(
            alertActions.set({
              type: "danger",
              message: err.message,
              autoClear: true
            })
          );
        } else {
          history.push("/login");
        }
      });
  };
};

export const updateConfigFile = (content, object) => {
  const { bucket, prefix } = pathSlice(history.location.pathname);

  return function(dispatch) {
    dispatch(setConfigContent(JSON.parse(content)));
    dispatch(setConfigContentPreChange(JSON.parse(content)));
    if (prefix == "server") {
      dispatch(browserActions.setServerConfigContent(JSON.parse(content)));
    }

    return web
      .PutObject({
        objectName: object,
        file: content
      })
      .then(res => {
        let configFileName = object.split("/").slice(-1)[0];
        dispatch(
          alertActions.set({
            type: "info",
            message: `New configuration file, ${configFileName} successfully created`,
            autoClear: true
          })
        );
        dispatch(setUpdatedConfig());
      })
      .catch(err => {
        if (web.LoggedIn()) {
          dispatch(
            alertActions.set({
              type: "danger",
              message: "Unable to update the configuration file",
              autoClear: true
            })
          );
        } else {
          history.push("/login");
        }
      });
  };
};

export const fetchConfigContent = fileName => {
  return function(dispatch, getState) {
    dispatch(resetLocalConfigList());

    if (fileName == "None") {
      dispatch(setConfigContent(null));
      dispatch(setUpdatedFormData(null));
    } else {
      const { bucket, prefix } = pathSlice(history.location.pathname);
      const currentBucket = getCurrentBucket(getState());
      const expiry = 5 * 24 * 60 * 60 + 1 * 60 * 60 + 0 * 60;

      if (prefix && fileName && fileName != "Upload") {
        return web
          .PresignedGet({
            bucket: currentBucket,
            object: fileName,
            expiry: expiry
          })
          .then(res => {
            fetch(res.url)
              .then(r => r.json())
              .then(data => {
                dispatch(setConfigContent(data));
                dispatch(setConfigContentPreChange(data));
                dispatch(setUpdatedFormData(data));
              })
              .catch(e => {
                dispatch(setConfigContent(null));
                dispatch(setConfigContentPreChange(null));
                dispatch(setUpdatedFormData(null));

                dispatch(
                  alertActions.set({
                    type: "danger",
                    message: `Warning: Config ${fileName} is invalid and was not loaded`,
                    autoClear: true
                  })
                );
              });
          })
          .catch(err => {
            if (web.LoggedIn()) {
              dispatch(
                alertActions.set({
                  type: "danger",
                  message: err.message,
                  autoClear: true
                })
              );
            } else {
              history.push("/login");
            }
          });
      } else if (prefix) {
        dispatch(setConfigContent(null));
        dispatch(setConfigContentPreChange(null));
        dispatch(setUpdatedFormData(null));
      } 
    }
  };
};

export const setUiSchemaSource = uiSchemaSource => ({
  type: SET_UISCHEMA_SOURCE,
  uiSchemaSource
});

export const fetchSchemaContent = fileName => {
  return function(dispatch, getState) {
    dispatch(setConfigContentPreSubmit())

    const uploadedTest = getState().editor.editorSchemaFiles.filter(file =>
      file.name.includes("local")
    )[0];

    if (uploadedTest != undefined) {
      dispatch(resetUploadedSchemaList());
    }

    const { bucket, prefix } = pathSlice(history.location.pathname);
    switch (true) {
      case fileName == "None" || fileName == undefined:
        dispatch(setSchemaContent(null));
        if (!getState().editorTools.editorSchemaSidebarOpen) {
          dispatch(actionsEditorTools.toggleEditorSchemaSideBar());
        }
        break;
      case fileName.match(regexSchemaPublic) != null:
        const schemaPublic = require(`../../schema/${
          fileName.split(" | ")[1]
        }/${fileName.split(" ")[0]}`);
        dispatch(setSchemaContent(schemaPublic));
        break;
      default:
        const currentBucket = getCurrentBucket(getState());
        const expiry = 5 * 24 * 60 * 60 + 1 * 60 * 60 + 0 * 60;
        if (prefix && fileName && fileName != "Upload") {
          return web
            .PresignedGet({
              bucket: currentBucket,
              object: fileName,
              expiry: expiry
            })
            .then(res => {
              fetch(res.url)
                .then(r => r.json())
                .then(data => {
                  dispatch(setSchemaContent(data));
                })
                .catch(e => {
                  dispatch(setSchemaContent(null));
                  dispatch(
                    alertActions.set({
                      type: "danger",
                      message: `Warning: Schema ${fileName} is invalid and was not loaded`,
                      autoClear: true
                    })
                  );
                });
            })
            .catch(err => {
              if (web.LoggedIn()) {
                dispatch(
                  alertActions.set({
                    type: "danger",
                    message: err.message,
                    autoClear: true
                  })
                );
              } else {
                history.push("/login");
              }
            });
        } else if (prefix) {
          dispatch(setSchemaContent(null));
        } 
    }
  };
};

export const fetchUISchemaContent = fileName => {
    return function(dispatch, getState) {
    dispatch(setConfigContentPreSubmit());
    dispatch(resetLocalUISchemaList());
    switch (true) {
      case fileName == "None" || fileName == undefined:
        dispatch(setUISchemaContent(null));
        break;
      case fileName.match(regexUISchemaPublic) != null:
          const uiSchemaPublic = require(`../../schema/${
            fileName.split(" | ")[1]
          }/${fileName.split(" ")[0]}`);
          dispatch(setUISchemaContent(uiSchemaPublic));
          break;
      default:
        const { bucket, prefix } = pathSlice(history.location.pathname);
        const expiry = 5 * 24 * 60 * 60 + 1 * 60 * 60 + 0 * 60;
        if (
          getState().editor.uiSchemaSource == "server" &&
          prefix &&
          fileName &&
          fileName != "Upload"
        ) {
          return web
            .PresignedGet({
              bucket: "server",
              object: fileName,
              expiry: expiry
            })
            .then(res => {
              fetch(res.url)
                .then(r => r.json())
                .then(data => {
                  dispatch(setUISchemaContent(data));
                })
                .catch(e => {
                  dispatch(setUISchemaContent(null));
                  dispatch(
                    alertActions.set({
                      type: "danger",
                      message: `Warning: UISchema ${fileName} is invalid and was not loaded`,
                      autoClear: true
                    })
                  );
                });
            })
            .catch(err => {
              if (web.LoggedIn()) {
                dispatch(
                  alertActions.set({
                    type: "danger",
                    message: err.message,
                    autoClear: true
                  })
                );
              } else {
                history.push("/login");
              }
            });
        } else if (getState().editor.uiSchemaSource == "server" && prefix) {
          dispatch(setUISchemaContent(null));
        } 
    }
  };
};

export const setConfigContentPreChange = configContentPreChange => ({
  type: SET_CONFIG_DATA_PRE_CHANGE,
  configContentPreChange
});

export const setConfigContent = configContent => ({
  type: SET_CONFIG_DATA,
  configContent
});

export const setUISchemaContent = uiContent => {
  return {
    type: SET_UI_SCHEMA_DATA,
    uiContent
  };
};

export const setSchemaContent = schemaContent => ({
  type: SET_SCHEMA_DATA,
  schemaContent
});

export const setUpdatedConfig = () => ({
  type: SET_UPDATED_CONFIG,
  configUpdate: true
});

export const showValidationAlert = () => {
  return function(dispatch) {
    dispatch(
      alertActions.set({
        type: "danger",
        message: `Warning: The updated configuration contains validation errors - please review and try again`,
        autoClear: true
      })
    );
  };
};

export const handleUploadedUISchma = file => {
  return function(dispatch) {
    if (isValidUISchema(file.name)) {
      let fileReader = new FileReader();
      fileReader.onloadend = e => {
        const content = fileReader.result;
        const fileNameShort = file.name.split("_")[1]
          ? file.name.split("_")[1]
          : file.name.split("_")[0];
        try {
          dispatch(setUISchemaContent(JSON.parse(content)));
          dispatch(resetLocalUISchemaList());
          dispatch(setUISchemaFile([`${fileNameShort} (local)`]));
        } catch (error) {
          dispatch(
            alertActions.set({
              type: "danger",
              message: `Warning: UISchema ${file.name} is invalid and was not loaded`,
              autoClear: true
            })
          );
        }
      };
      fileReader.readAsText(file);
    } else {
      dispatch(
        alertActions.set({
          type: "danger",
          message: `${file.name} is an invalid file/filename`,
          autoClear: true
        })
      );
    }
  };
};

// This is run when uploading a schema file
export const handleUploadedSchma = file => {
  return function(dispatch) {
    if (isValidSchema(file.name)) {
      let fileReader = new FileReader();
      fileReader.onloadend = e => {
        const content = fileReader.result;
        const fileNameShort = file.name.split("_")[1]
          ? file.name.split("_")[1]
          : file.name.split("_")[0];
        try {
          dispatch(setSchemaContent(JSON.parse(content)));
          dispatch(resetLocalSchemaList());
          dispatch(setSchemaFile([`${fileNameShort} (local)`]));
        } catch (error) {
          dispatch(
            alertActions.set({
              type: "danger",
              message: `Warning: Schema ${file.name} is invalid and was not loaded`,
              autoClear: true
            })
          );
        }
      };
      fileReader.readAsText(file);
    } else {
      dispatch(
        alertActions.set({
          type: "danger",
          message: `${file.name} is an invalid file/filename`,
          autoClear: true
        })
      );
    }
  };
};

// handle when the user uploads a configuration file
export const handleUploadedConfig = file => {
  return function(dispatch, getState) {
    const { bucket, prefix } = pathSlice(history.location.pathname);

    // load the matching schema files if a schema file is not already uploaded
    const localLoaded =
      getState().editor.editorSchemaFiles[0] &&
      getState().editor.editorSchemaFiles[0].name.includes("local");

    if (file && file.name && file.name.length && !localLoaded && !prefix) {
      dispatch(publicSchemaFiles(file.name));
    }
    if (isValidConfig(file.name)) {
      let fileReader = new FileReader();
      fileReader.onloadend = e => {
        const content = fileReader.result;
        const fileNameShort = file.name.split("_")[1]
          ? file.name.split("_")[1]
          : file.name.split("_")[0];
        try {
          const jsonContent = JSON.parse(content);
          dispatch(setConfigContent(jsonContent));
          dispatch(resetLocalConfigList());
          dispatch(setConfigFile([`${fileNameShort} (local)`]));
        } catch (error) {
          dispatch(
            alertActions.set({
              type: "danger",
              message: `Warning: Config ${file.name} is invalid and was not loaded`,
              autoClear: true
            })
          );
        }
      };
      fileReader.readAsText(file);
    } else {
      dispatch(
        alertActions.set({
          type: "danger",
          message: `${file.name} is an invalid file/filename`,
          autoClear: true
        })
      );
    }
  };
};

export const setUISchemaFile = UISchemaFiles => ({
  type: SET_UISCHEMA_LIST,
  UISchemaFiles: UISchemaFiles.map((file, index) => ({
    name: file,
    selected: index == 0 ? true : false
  }))
});

export const setSchemaFile = schemaFiles => ({
  type: SET_SCHEMA_LIST,
  schemaFiles: schemaFiles.map((file, index) => ({
    name: file,
    selected: index == 0 ? true : false
  }))
});

export const setConfigFile = configFiles => ({
  type: SET_CONFIG_LIST,
  configFiles: configFiles.map((file, index) => ({
    name: file,
    selected: index == 0 ? true : false
  }))
});

export const saveUpdatedConfiguration = (filename, content) => {
  return function(dispatch) {
    dispatch(setConfigContent(content));
    let blob = new Blob([JSON.stringify(content, null, 2)], {
      type: "text/json"
    });
    saveAs(blob, `${filename}`);
  };
};

export const setUpdatedFormData = formData => {
  return {
    type: SET_UPDATED_FORM_DATA,
    formData
  };
};

export const setConfigContentPreSubmit = () => {
  return function(dispatch, getState) {
    dispatch(setConfigContent(getState().editor.formData));
  };
};

export const resetFiles = () => ({
  type: RESET_SCHEMA_FILES,
  reset: true
});

export const resetUISchemaList = () => ({
  type: RESET_UISCHEMA_LIST,
  UISchemaFiles: []
});

export const resetConfigFiles = () => ({
  type: RESET_CONFIG_LIST,
  configFiles: []
});

export const resetSchemaFiles = () => ({
  type: RESET_SCHEMA_LIST,
  schemaFiles: []
});

export const resetLocalUISchemaList = () => ({
  type: RESET_LOCAL_UISCHEMA_LIST
});

export const resetLocalSchemaList = () => ({
  type: RESET_LOCAL_SCHEMA_LIST
});

export const resetUploadedSchemaList = () => ({
  type: RESET_UPLOADED_SCHEMA_LIST
});

export const resetLocalConfigList = () => ({
  type: RESET_LOCAL_CONFIG_LIST
});