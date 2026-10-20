// GameKit export for Ghidra headless (gamekit ghidra runs it as -postScript).
// Args: <outDir> <il2cpp script.json | -> <function regex | all | -> <max decompiled functions>
// Writes functions.tsv, strings.tsv and c/<name>@<address>.c. With an Il2CppDumper script.json it
// first names methods, string literals and metadata (addresses there are RVAs from the image base).
//@category GameKit
import java.io.File;
import java.io.FileReader;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.data.StringDataInstance;
import ghidra.program.model.listing.Data;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;
import ghidra.program.model.symbol.SourceType;
import ghidra.program.util.DefinedDataIterator;

public class GameKitExport extends GhidraScript {

	@Override
	public void run() throws Exception {
		String[] args = getScriptArgs();
		if (args.length < 1) {
			printerr("GameKitExport: thiếu thư mục xuất");
			return;
		}
		File out = new File(args[0]);
		out.mkdirs();
		String il2cpp = args.length > 1 ? args[1] : "-";
		String filter = args.length > 2 ? args[2] : "-";
		int max = args.length > 3 ? Integer.parseInt(args[3]) : 200;

		if (!il2cpp.equals("-")) {
			applyIl2cpp(new File(il2cpp));
		}
		writeFunctions(new File(out, "functions.tsv"));
		writeStrings(new File(out, "strings.tsv"));
		if (!filter.equals("-")) {
			decompile(new File(out, "c"), filter, max);
		}
		// gamekit ghidra treats the export as complete only when this file exists.
		try (PrintWriter w = new PrintWriter(new File(out, "done"), StandardCharsets.UTF_8)) {
			w.println(currentProgram.getName());
		}
	}

	private static String clean(String s) {
		return s.replace("\t", "\\t").replace("\r", "\\r").replace("\n", "\\n");
	}

	/** Ghidra symbols cannot hold whitespace; keep everything else Il2CppDumper produces. */
	private static String symbol(String s) {
		String n = s.replaceAll("\\s+", "_");
		return n.isEmpty() ? "_" : n;
	}

	private Address rva(JsonObject o) {
		return currentProgram.getImageBase().add(o.get("Address").getAsLong());
	}

	private void applyIl2cpp(File json) throws Exception {
		JsonObject root;
		try (FileReader r = new FileReader(json, StandardCharsets.UTF_8)) {
			root = JsonParser.parseReader(r).getAsJsonObject();
		}
		int named = 0, created = 0, failed = 0;
		JsonArray methods = root.has("ScriptMethod") ? root.getAsJsonArray("ScriptMethod") : new JsonArray();
		monitor.initialize(methods.size());
		monitor.setMessage("GameKit: đặt tên hàm IL2CPP");
		for (JsonElement e : methods) {
			monitor.checkCancelled();
			monitor.incrementProgress(1);
			JsonObject m = e.getAsJsonObject();
			String name = symbol(m.get("Name").getAsString());
			try {
				Address a = rva(m);
				Function f = getFunctionAt(a);
				if (f == null) {
					disassemble(a);
					f = createFunction(a, name);
					if (f != null) created++;
				}
				if (f != null) {
					f.setName(name, SourceType.USER_DEFINED);
					if (m.has("Signature")) {
						setPlateComment(a, m.get("Signature").getAsString());
					}
					named++;
				} else {
					failed++;
				}
			} catch (Exception ex) {
				failed++;
			}
		}
		int labels = 0;
		for (String key : new String[] { "ScriptString", "ScriptMetadata", "ScriptMetadataMethod" }) {
			if (!root.has(key)) continue;
			for (JsonElement e : root.getAsJsonArray(key)) {
				monitor.checkCancelled();
				JsonObject o = e.getAsJsonObject();
				try {
					Address a = rva(o);
					if (key.equals("ScriptString")) {
						String v = o.get("Value").getAsString();
						String head = v.replaceAll("[^A-Za-z0-9_]", "_");
						createLabel(a, "StringLiteral_" + (head.length() > 32 ? head.substring(0, 32) : head), true, SourceType.USER_DEFINED);
						setEOLComment(a, clean(v));
					} else {
						createLabel(a, symbol(o.get("Name").getAsString()), true, SourceType.USER_DEFINED);
					}
					labels++;
				} catch (Exception ex) {
					// address outside the binary or label clash: skip it
				}
			}
		}
		println(String.format("GameKit: IL2CPP %d hàm có tên (%d tạo mới, %d lỗi), %d nhãn", named, created, failed, labels));
	}

	private void writeFunctions(File file) throws Exception {
		try (PrintWriter w = new PrintWriter(file, StandardCharsets.UTF_8)) {
			w.println("address\tname\tsize\tsignature");
			FunctionIterator it = currentProgram.getFunctionManager().getFunctions(true);
			while (it.hasNext()) {
				monitor.checkCancelled();
				Function f = it.next();
				w.println(f.getEntryPoint() + "\t" + clean(f.getName(true)) + "\t" + f.getBody().getNumAddresses() + "\t" + clean(f.getPrototypeString(false, false)));
			}
		}
	}

	private void writeStrings(File file) throws Exception {
		try (PrintWriter w = new PrintWriter(file, StandardCharsets.UTF_8)) {
			w.println("address\tstring");
			for (Data d : DefinedDataIterator.definedStrings(currentProgram)) {
				monitor.checkCancelled();
				String v = StringDataInstance.getStringDataInstance(d).getStringValue();
				if (v != null) w.println(d.getAddress() + "\t" + clean(v));
			}
		}
	}

	private void decompile(File dir, String filter, int max) throws Exception {
		dir.mkdirs();
		Pattern p = filter.equals("all") ? null : Pattern.compile(filter);
		DecompInterface ifc = new DecompInterface();
		ifc.openProgram(currentProgram);
		int done = 0;
		try {
			FunctionIterator it = currentProgram.getFunctionManager().getFunctions(true);
			while (it.hasNext() && done < max) {
				monitor.checkCancelled();
				Function f = it.next();
				if (f.isThunk() || f.isExternal()) continue;
				String full = f.getName(true);
				if (p != null && !p.matcher(full).find()) continue;
				DecompileResults res = ifc.decompileFunction(f, 60, monitor);
				if (res == null || !res.decompileCompleted() || res.getDecompiledFunction() == null) continue;
				String safe = full.replaceAll("[^A-Za-z0-9_.$-]", "_");
				if (safe.length() > 120) safe = safe.substring(0, 120);
				try (PrintWriter w = new PrintWriter(new File(dir, safe + "@" + f.getEntryPoint() + ".c"), StandardCharsets.UTF_8)) {
					w.println("// " + full + " @ " + f.getEntryPoint());
					w.print(res.getDecompiledFunction().getC());
				}
				done++;
			}
		} finally {
			ifc.dispose();
		}
		println("GameKit: decompile " + done + " hàm" + (done >= max ? " (đạt giới hạn " + max + ")" : ""));
	}
}
