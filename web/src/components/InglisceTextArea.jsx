import { useKeyboardFSM } from "../hooks/useKeyboardFSM";
import CustomTextArea from "./ui/CustomTextArea";

const Transformations = {
    A: { A: "Â", k: "Á", "`": "À"},
    a: { a: "â", k: "á", "`": "à" },
    C: { x: "C̃"},
    c: { w: "ç", x: "c̃" },
    d: { j: "d̦" },
    E: { E: "Ê", k: "É" },
    e: { e: "ê", k: "é" },
    I: { I: "Î", k: "Í" },
    i: { i: "î", j: "ï", k: "í" },
    M: { j: "M̃" },
    m: { j: "m̃" },
    N: { j: "Ñ" },
    n: { j: "ñ" },
    O: { O: "Ô", k: "Ó", "`": "Ò" },
    o: { o: "ô", k: "ó", "`": "ò" },
    S: { x: "Ș" },
    s: { x: "ș" },
    T: { h: "Ћ" },
    t: { j: "ț", h: "þ" },
    U: { U: "Û", j: "Ü", k: "Ú" },
    u: { u: "û", j: "ü", k: "ú" },
    w: { a: "à", e: "è", i: "ï", o: "ò", u: "ü" },
};

export default function InglisceTextArea() {
    const { text, setText, handleKeyDown } = useKeyboardFSM({
        transformations: Transformations,
    });

    return (
        <CustomTextArea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ fontSize: "16px" }}
        />
    );
}